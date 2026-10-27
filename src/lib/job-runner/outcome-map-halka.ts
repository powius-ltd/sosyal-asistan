/**
 * Halka uçlarının (`measure_zernio`, `discover`) özet → iş sonucu eşlemesi (SAF). Ana eşleme dosyasına (`outcome-map.ts`) eklenmez:
 * dosya boyu sınırı. Kurallar aynıdır: tasarım gereği boş kalmak başarıdır, kodu nedenini söyler; anahtar yoksa iş `blocked`.
 */
import "server-only";

import type { DiscoverSummary } from "@/lib/collection/discover";
import { discoverVerdict, type JobVerdict } from "@/lib/job-runner/outcome-map";
import { formatZernioResult } from "@/lib/outcomes/measure-zernio";
import type { OrderReturnRun, PublishRun } from "@/lib/publish/real-run";
import type { OrderRunResult } from "@/lib/studio-order/run";
import type { ZernioJobResult } from "@/lib/outcomes/zernio-job";

export function zernioVerdict(run: ZernioJobResult): JobVerdict {
  if (run.outcome === "key_missing") {
    const note = "Bu çalışma alanı için Zernio anahtarı yok: hiçbir çağrı yapılmadı.";
    return { step: { status: "needs_approval", code: "zernio_key_missing", note }, final: { status: "blocked", result: { outcome: "zernio_key_missing", exitCode: 1 } } };
  }
  const { result } = run;
  const note = formatZernioResult(result).join(" · ");
  if (result.outcome === "no_account") {
    return { step: { status: "skipped", code: "no_targets", note }, final: { status: "succeeded", result: { outcome: "no_targets", exitCode: 2 } } };
  }
  if (result.reels === 0) {
    return { step: { status: "skipped", code: "no_reels", note }, final: { status: "succeeded", result: { outcome: "no_reels", exitCode: 0 } } };
  }
  return { step: { status: "ok", note }, final: { status: "succeeded", result: { exitCode: 0 } } };
}

/** Tek başına keşif işi: aday çıkmaması hata değildir. Koşu başlamadıysa (`outcome` tamam değil) adım atlanır, iş yine temiz kapanır. */
export function discoverJobVerdict(summary: DiscoverSummary): JobVerdict {
  const step = discoverVerdict(summary);
  const spend = step.spend === undefined ? undefined : { spend: { actualUsd: step.spend.actualUsd } };
  if (summary.outcome !== "completed") return { step: { ...step, code: "nothing_to_do" }, final: { status: "succeeded", result: { outcome: "nothing_to_do", exitCode: 0 } } };
  return { step, final: { status: "succeeded", result: { exitCode: 0, ...(spend?.spend?.actualUsd === undefined ? {} : { spend: { actualUsd: spend.spend.actualUsd } }) } } };
}

/** Sipariş yazımı: yazılan fiş ya da zaten var olan fiş başarıdır; plan yoksa / öğe fişe çevrilemediyse adım atlanır (hata değil). */
export function orderVerdict(run: OrderRunResult): JobVerdict {
  const notes = [...run.written.map((w) => `yazıldı: ${w.orderId}`), ...run.skipped.map((s) => `${s.orderId ?? s.slot ?? "öğe"}: ${s.reason === "exists" ? "fiş zaten var, dokunulmadı" : s.reason}`)];
  const note = notes.length > 0 ? notes.join(" · ") : run.planFound ? "Yazılacak öğe yok." : "Bu hafta için plan yok.";
  if (run.written.length === 0 && !run.skipped.some((s) => s.reason === "exists")) {
    return { step: { status: "skipped", code: "no_plan", note }, final: { status: "succeeded", result: { outcome: "no_plan", exitCode: 0 } } };
  }
  return { step: { status: "ok", note }, final: { status: "succeeded", result: { exitCode: 0 } } };
}

const SKIP_PLAIN: Record<string, string> = {
  invalid_ticket: "fiş geçersiz", video_missing: "video dosyası yok", caption_missing: "açıklama yok", caption_invalid: "açıklama geçersiz", no_account: "yayına açık hesap yok", media_outside_root: "video yolu sipariş klasörünün dışında",
};

/** Dönüş: açılan / taslak kalan / zaten işlenmiş sipariş yoksa adım atlanır (hata değil). Atlanan fişler nota yazılır, iş yine başarıdır. */
export function orderReturnVerdict(run: OrderReturnRun): JobVerdict {
  if (run.outcome === "not_studio") {
    return { step: { status: "skipped", code: "nothing_to_do", note: "Bu hesap stüdyoda tanımlı değil." }, final: { status: "succeeded", result: { outcome: "nothing_to_do", exitCode: 0 } } };
  }
  const { opened, drafts, skipped, alreadyHandled } = run.result;
  const notes = [
    ...opened.map((id) => `onaya hazır: ${id}`),
    ...drafts.map((id) => `taslak (uyum): ${id}`),
    ...skipped.map((s) => `${s.orderId}: ${SKIP_PLAIN[s.reason] ?? s.reason}`),
    ...(alreadyHandled > 0 ? [`${alreadyHandled} sipariş zaten işlenmiş`] : []),
  ];
  if (opened.length + drafts.length === 0) {
    return { step: { status: "skipped", code: "nothing_to_do", note: notes.join(" · ") || "Dönen video yok." }, final: { status: "succeeded", result: { outcome: "nothing_to_do", exitCode: 0 } } };
  }
  return { step: { status: "ok", note: notes.join(" · ") }, final: { status: "succeeded", result: { exitCode: 0 } } };
}

/** Yayın: hiçbir şey yapılmadıysa atlanır; yalnız hata varsa (hiç zamanlanmadı / yayınlanmadı) iş `failed`, karışıksa `partial`. */
export function publishVerdict(run: PublishRun): JobVerdict {
  if (run.outcome === "not_studio") {
    return { step: { status: "skipped", code: "nothing_to_do", note: "Bu hesap stüdyoda tanımlı değil." }, final: { status: "succeeded", result: { outcome: "nothing_to_do", exitCode: 0 } } };
  }
  if (run.outcome === "key_missing") {
    const note = "Bu çalışma alanı için Zernio anahtarı yok: hiçbir çağrı yapılmadı.";
    return { step: { status: "needs_approval", code: "zernio_key_missing", note }, final: { status: "blocked", result: { outcome: "zernio_key_missing", exitCode: 1 } } };
  }
  const { scheduled, published, failed, stuck, waiting } = run.result;
  const unconfirmed = run.result.unconfirmed ?? [];
  const manual = run.result.manual ?? [];
  const unverified = run.result.unverified ?? [];
  const note = [
    ...scheduled.map((id) => `zamanlandı: ${id}`),
    ...published.map((id) => `yayında: ${id}`),
    ...failed.map((f) => `düştü: ${f.orderId} (${f.code})`),
    ...stuck.map((id) => `takılı, dokunulmadı: ${id}`),
    ...unconfirmed.map((u) => `doğrulanamadı, Zernio'dan kontrol et: ${u.orderId}${u.postId ? ` (gönderi ${u.postId})` : ""}`),
    ...manual.map((m) => `elle kontrol (önceki tur, bildirim yazıldı): ${m.orderId}`),
    ...unverified.map((u) => `yayın doğrulanamıyor (saatinden 24 saat geçti, bildirim yazıldı): ${u.orderId}`),
    ...(waiting > 0 ? [`${waiting} gönderi yayın saatini bekliyor`] : []),
  ].join(" · ");
  const done = scheduled.length + published.length;
  if (done + failed.length + stuck.length + waiting === 0) {
    return { step: { status: "skipped", code: "nothing_to_do", note: note || "Onaylı, gönderilecek video yok." }, final: { status: "succeeded", result: { outcome: "nothing_to_do", exitCode: 0 } } };
  }
  if (failed.length > 0 || stuck.length > 0) {
    return { step: { status: done > 0 ? "ok" : "failed", code: "step_failed", note }, final: { status: done > 0 ? "partial" : "failed", result: { outcome: "step_failed", exitCode: 4 } } };
  }
  // Yalnız saatini bekleyen gönderi var, hiçbir satır ilerlemedi: "yapacak iş yok" (zincir bu adımı yeniden açmaz, `no-progress.ts`).
  if (done === 0) return { step: { status: "ok", note }, final: { status: "succeeded", result: { outcome: "nothing_to_do", exitCode: 0 } } };
  return { step: { status: "ok", note }, final: { status: "succeeded", result: { exitCode: 0 } } };
}
