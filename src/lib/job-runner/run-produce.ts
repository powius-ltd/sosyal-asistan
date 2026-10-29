/**
 * `produce` işi (SPN-33 "Hat H1: kapı"): fişteki "Üretime gönder" düğmesinin işi. Üç adım, hepsi sabit sırayla:
 *
 *  1. `order`        fişi stüdyo klasörüne `onay: evet` ile yazar (`sendOrderToStudio`; idempotent, var olanın üstüne yazmaz).
 *  2. `produce`      stüdyoyu SABİT argümanla çalıştırır (`studio-process.ts`); sonucu çıkış koduna DEĞİL fişin dosya durumuna bakarak okur.
 *  3. `order_return` biter bitmez YALNIZ bu siparişin dönüşünü koşturur (yayın satırı `awaiting_approval` + panel fişi `uretildi` / `hata`).
 *
 * HARCAMA KAPISI: stüdyo ücretli ses kullanır; geçerli, taze, tek seferlik USD onayı yoksa dosya bile yazılmaz (`blocked`). Hesabın ses
 * anahtarı yoksa stüdyo hiç başlamaz (`voice_key_missing`). İstekten gelen hiçbir değer komut satırına girmez: yalnız panelin kendi fişinin
 * (şemadan geçmiş) kimliği ve yolu. Yayın ONAYI burada verilmez: dönüş yalnız onay bekleyen satır açar.
 */
import "server-only";

import { existsSync, readFileSync } from "node:fs";

import type { PanelJob } from "@/lib/domain/panel-job";
import type { IntelContext } from "@/lib/intel/context";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import type { JobFinal, JobSession } from "@/lib/job-runner/job-session";
import { orderReturnVerdict } from "@/lib/job-runner/outcome-map-halka";
import { cutFinal, secondsSince } from "@/lib/job-runner/run-single";
import { spendGate } from "@/lib/job-runner/spend-gate";
import { studioVoiceKeyName } from "@/lib/studio-order/voice-key";
import { findStudioAccount } from "@/lib/studio-order/accounts";
import type { OrderStatus } from "@/lib/studio-order/schema";
import { OrderSendError, type SendOrderResult } from "@/lib/studio-order/send-to-studio";
import { readTicket } from "@/lib/studio-order/ticket-file";

/** Fişin dosyadaki güncel durumu (okunamıyorsa undefined). */
function fileStatusOf(path: string): OrderStatus | undefined {
  try {
    return existsSync(path) ? readTicket(readFileSync(path, "utf8")).ticket.durum : undefined;
  } catch {
    return undefined;
  }
}

type BlockCode = "approval_missing" | "approval_expired" | "order_not_sendable" | "voice_key_missing";

async function blockAtOrder(session: JobSession, code: BlockCode, note: string): Promise<JobFinal> {
  session.log(note);
  await session.finishStep("order", { status: "needs_approval", code, note, seconds: 0 });
  return { status: "blocked", result: { outcome: code }, error: note };
}

export async function runProduceJob(job: PanelJob, ctx: IntelContext, session: JobSession, deps: JobRunnerDeps, clockMs: () => number): Promise<JobFinal> {
  const orderId = job.params.orderId;
  if (orderId === undefined) throw new Error("Üretim işinde fiş kimliği yok: iş koşturulmadı.");
  await session.setSteps([{ id: "order", status: "pending" }, { id: "produce", status: "pending" }, { id: "order_return", status: "pending" }]);

  // Harcama kapısı: yalnız taze, tek seferlik USD onayı. Kapalıyken dosya yazılmaz, stüdyo çağrılmaz.
  const gate = spendGate(job, ctx.now);
  if (!gate.open) return blockAtOrder(session, gate.code, gate.note);
  if (gate.basis !== "one_time") return blockAtOrder(session, "approval_missing", "Üretim yalnız tek seferlik tutar onayıyla başlar: stüdyo çağrılmadı.");

  const account = findStudioAccount(ctx.workspaceSlug);
  if (account === undefined) return blockAtOrder(session, "order_not_sendable", "Bu hesap stüdyoda tanımlı değil: fiş gönderilmedi.");
  const keyName = studioVoiceKeyName(account.studioSlug);
  if (deps.missingEnv([keyName]).length > 0) return blockAtOrder(session, "voice_key_missing", `Bu hesabın ses anahtarı yok (${keyName}): fiş gönderilmedi, stüdyo çağrılmadı.`);

  if (!(await session.tryStartStep("order"))) return cutFinal(session);
  let t0 = clockMs();
  let sent: SendOrderResult;
  try {
    sent = await deps.sendOrder(ctx, orderId);
  } catch (error) {
    if (error instanceof OrderSendError) return blockAtOrder(session, "order_not_sendable", `Fiş gönderilemedi (${error.code}): ${error.message}`);
    await session.finishStep("order", { status: "failed", note: error instanceof Error ? error.message : "bilinmeyen hata", seconds: secondsSince(t0, clockMs()) });
    throw error;
  }
  await session.finishStep("order", { status: "ok", note: sent.outcome === "written" ? `fiş yazıldı: ${sent.ticketId}` : `fiş zaten vardı (${sent.fileStatus}): ${sent.ticketId}`, seconds: secondsSince(t0, clockMs()) });

  // Üretim: dosya durumu karar verir. `taslak` ise stüdyo çalışır; başka biri üretiyorsa (`uretiliyor`) dokunulmaz; bittiyse yeniden üretilmez.
  if (!(await session.tryStartStep("produce"))) return cutFinal(session);
  t0 = clockMs();
  let status: OrderStatus | undefined = sent.fileStatus;
  let failure: JobFinal | undefined;
  if (status === "taslak") {
    const run = await deps.runStudio({ studioSlug: sent.studioSlug, ticketPath: sent.path, root: deps.orderRoot() });
    if (run.tail !== "") session.log(`Stüdyo: ${run.tail}`);
    status = fileStatusOf(sent.path);
    if (run.spawnFailed) failure = { status: "failed", result: { outcome: "studio_unavailable" }, error: "Stüdyo başlatılamadı." };
    else if (run.timedOut) failure = { status: "failed", result: { outcome: "timeout" }, error: "Stüdyo süre sınırında bitmedi." };
    else if (status === "taslak" || status === "uretiliyor") failure = { status: "blocked", result: { outcome: "studio_busy" }, error: "Stüdyo bu fişi üretmedi (onay yok ya da başka üretim sürüyor)." };
  } else if (status === "uretiliyor") {
    failure = { status: "blocked", result: { outcome: "studio_busy" }, error: "Bu fiş şu anda üretiliyor." };
  }
  if (failure !== undefined && status !== "hata") {
    await session.finishStep("produce", { status: "failed", ...(failure.result?.outcome === undefined ? {} : { code: failure.result.outcome }), note: failure.error ?? "", seconds: secondsSince(t0, clockMs()) });
    await session.finishStep("order_return", { status: "skipped", note: "Üretim bitmedi: dönüş koşmadı.", seconds: 0 });
    return failure;
  }
  const produced = status === "hata" ? { status: "failed" as const, code: "studio_failed" as const, note: "Stüdyo üretimi hata ile bitirdi." } : { status: "ok" as const, note: status === "uretildi" ? "video üretildi" : "üretim bitti" };
  await session.finishStep("produce", { ...produced, seconds: secondsSince(t0, clockMs()) });

  // Dönüş: yalnız bu sipariş (hata ise panel fişi `hata` olur, başarıda yayın satırı onay bekler).
  if (!(await session.tryStartStep("order_return"))) return cutFinal(session);
  t0 = clockMs();
  const returned = await deps.returnOrders(ctx, { log: session.log, onlyOrderId: sent.ticketId });
  const verdict = orderReturnVerdict(returned);
  await session.finishStep("order_return", { ...verdict.step, seconds: secondsSince(t0, clockMs()) });
  if (status === "hata") return { status: "failed", result: { outcome: "studio_failed" }, error: "Stüdyo üretimi hata ile bitirdi; fiş hata olarak işaretlendi." };
  return verdict.final.status === "succeeded" ? { status: "succeeded", result: { exitCode: 0 } } : verdict.final;
}
