/** `produce` işi: onay kapısı, anahtar kapısı, stüdyo sonucu (dosya durumundan), yalnız o siparişin dönüşü. Stüdyo ve dönüş SAHTE; dosyalar geçici klasörde. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { PanelJob } from "@/lib/domain/panel-job";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import { runJob } from "@/lib/job-runner/run-job";
import type { StudioRunInput, StudioRunResult } from "@/lib/job-runner/studio-process";
import { approval, claimedJob, fakeContext, fakeDeps, fakeStore, NOW, WORKER_ID } from "@/lib/job-runner/test-support";
import { OrderSendError, type SendOrderResult } from "@/lib/studio-order/send-to-studio";
import { readTicket, writeTicket } from "@/lib/studio-order/ticket-file";

const ORDER_ID = "44444444-4444-4444-8444-444444444444";
const TICKET_ID = "ornek-studyo-test-0";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const baseTicket = {
  siparis_id: TICKET_ID, plan_hafta: "2026-10-26", hesap: "ornek-studyo", mod: "senaryo", tur: "broll", sutun: "Deneme", istenen_saat: "2026-10-30 18:00",
  onay: true, durum: "taslak", senaryo: "Merhaba, bu bir deneme senaryosudur.",
} as never;

function setup(options: { studioWrites?: "uretildi" | "hata" | "none"; fileStatus?: "taslak" | "uretiliyor" | "uretildi"; exitCode?: number | null; spawnFailed?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "spn33-produce-"));
  dirs.push(root);
  const dir = join(root, "ornek-studyo", "2026-10-26");
  const path = join(dir, `${TICKET_ID}.md`);
  const studioCalls: StudioRunInput[] = [];
  const sendOrder = async (): Promise<SendOrderResult> => {
    mkdirSync(dir, { recursive: true });
    const status = options.fileStatus ?? "taslak";
    writeFileSync(path, writeTicket({ ...(baseTicket as object), durum: status } as never, "not"), "utf8");
    return { outcome: "written", path, ticketId: TICKET_ID, studioSlug: "ornek-studyo", fileStatus: status };
  };
  const runStudio = async (input: StudioRunInput): Promise<StudioRunResult> => {
    studioCalls.push(input);
    const text = readFileSync(path, "utf8");
    const ticket = readTicket(text).ticket;
    if (options.studioWrites === "uretildi") writeFileSync(path, writeTicket({ ...ticket, durum: "uretildi" }, "not"), "utf8");
    if (options.studioWrites === "hata") writeFileSync(path, writeTicket({ ...ticket, durum: "hata", hata_notu: "Ses üretilemedi." }, "not"), "utf8");
    return { exitCode: options.exitCode ?? 0, timedOut: false, tail: "", spawnFailed: options.spawnFailed ?? false };
  };
  return { root, studioCalls, sendOrder, runStudio };
}

const produceJob = (overrides: Partial<PanelJob> = {}): PanelJob => claimedJob({ kind: "produce", params: { orderId: ORDER_ID }, approval: approval(0.5), ...overrides });

async function run(job: PanelJob, overrides: Partial<JobRunnerDeps>) {
  const fake = fakeStore();
  const deps = fakeDeps({ createContext: async (now, workspaceId) => ({ ...fakeContext(now, workspaceId), workspaceSlug: "ornekstudyoapp" }), ...overrides });
  await runJob(job, { store: fake.store, deps, workerId: WORKER_ID, clock: () => NOW, clockMs: () => 0, echo: () => undefined, heartbeatMs: 60_000 });
  return { deps, fake, closing: fake.closing() };
}

describe("produce işi", () => {
  it("başarı: dosya yazılır, stüdyo çalışır, YALNIZ o siparişin dönüşü koşar", async () => {
    const s = setup({ studioWrites: "uretildi" });
    const { deps, closing, fake } = await run(produceJob(), {
      sendOrder: s.sendOrder, runStudio: s.runStudio, orderRoot: () => s.root,
      returnOrders: async () => ({ outcome: "done", result: { opened: [TICKET_ID], drafts: [], skipped: [], alreadyHandled: 0 } as never }),
    });
    expect(closing).toMatchObject({ status: "succeeded" });
    expect(s.studioCalls).toHaveLength(1);
    expect(s.studioCalls[0]).toMatchObject({ studioSlug: "ornek-studyo", root: s.root });
    expect(deps.returnOrders).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ onlyOrderId: TICKET_ID }));
    expect(fake.stepStatuses()).toEqual({ order: "ok", produce: "ok", order_return: "ok" });
  });

  it("onay yok: dosya yazılmaz, stüdyo çağrılmaz, iş blocked", async () => {
    const s = setup();
    const { deps, closing } = await run(produceJob({ approval: undefined }), { sendOrder: s.sendOrder, runStudio: s.runStudio });
    expect(closing).toMatchObject({ status: "blocked" });
    expect(deps.sendOrder).not.toHaveBeenCalled();
    expect(s.studioCalls).toHaveLength(0);
  });

  it("24 saatten eski onay stüdyoyu çalıştırmaz", async () => {
    const s = setup();
    const { deps, closing } = await run(produceJob({ approval: approval(0.5, 25 * 60) }), { sendOrder: s.sendOrder, runStudio: s.runStudio });
    expect(closing).toMatchObject({ status: "blocked" });
    expect(deps.sendOrder).not.toHaveBeenCalled();
  });

  it("hesabın ses anahtarı yoksa dosya yazılmaz ve stüdyo çağrılmaz (voice_key_missing)", async () => {
    const s = setup();
    const { deps, closing } = await run(produceJob(), { missingEnv: (names) => names.filter((n) => n === "ELEVENLABS_API_KEY_ORNEK_STUDYO"), sendOrder: s.sendOrder, runStudio: s.runStudio });
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "voice_key_missing" } });
    expect(deps.sendOrder).not.toHaveBeenCalled();
    expect(s.studioCalls).toHaveLength(0);
  });

  it("gönderilemeyen fiş (ör. anlatım) blocked + order_not_sendable; stüdyo çağrılmaz", async () => {
    const s = setup();
    const { closing } = await run(produceJob(), {
      sendOrder: async () => {
        throw new OrderSendError("kind_narration", "anlatım gönderilmez");
      },
      runStudio: s.runStudio,
    });
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "order_not_sendable" } });
    expect(s.studioCalls).toHaveLength(0);
  });

  it("stüdyo hata ile bitirirse dönüş yine koşar (panel fişi hata olur) ve iş failed/studio_failed", async () => {
    const s = setup({ studioWrites: "hata", exitCode: 1 });
    const { deps, closing } = await run(produceJob(), { sendOrder: s.sendOrder, runStudio: s.runStudio, orderRoot: () => s.root, returnOrders: async () => ({ outcome: "done", result: { opened: [], drafts: [], skipped: [], alreadyHandled: 0 } as never }) });
    expect(closing).toMatchObject({ status: "failed", result: { outcome: "studio_failed" } });
    expect(deps.returnOrders).toHaveBeenCalledTimes(1);
  });

  it("stüdyo fişe dokunmadan çıkarsa (çıkış 2, dosya taslak) blocked/studio_busy ve dönüş koşmaz", async () => {
    const s = setup({ studioWrites: "none", exitCode: 2 });
    const { deps, closing } = await run(produceJob(), { sendOrder: s.sendOrder, runStudio: s.runStudio, orderRoot: () => s.root });
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "studio_busy" } });
    expect(deps.returnOrders).not.toHaveBeenCalled();
  });

  it("başka biri üretiyorsa (dosya uretiliyor) stüdyo çağrılmaz", async () => {
    const s = setup({ fileStatus: "uretiliyor" });
    const { closing } = await run(produceJob(), { sendOrder: s.sendOrder, runStudio: s.runStudio, orderRoot: () => s.root });
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "studio_busy" } });
    expect(s.studioCalls).toHaveLength(0);
  });

  it("nöbet zaten üretmişse (dosya uretildi) yeniden üretilmez, doğrudan dönüş koşar", async () => {
    const s = setup({ fileStatus: "uretildi" });
    const { deps, closing } = await run(produceJob(), {
      sendOrder: s.sendOrder, runStudio: s.runStudio, orderRoot: () => s.root,
      returnOrders: async () => ({ outcome: "done", result: { opened: [TICKET_ID], drafts: [], skipped: [], alreadyHandled: 0 } as never }),
    });
    expect(closing).toMatchObject({ status: "succeeded" });
    expect(s.studioCalls).toHaveLength(0);
    expect(deps.returnOrders).toHaveBeenCalledTimes(1);
  });

  it("stüdyo başlatılamazsa failed/studio_unavailable", async () => {
    const s = setup({ spawnFailed: true, exitCode: null });
    const { closing } = await run(produceJob(), { sendOrder: s.sendOrder, runStudio: s.runStudio, orderRoot: () => s.root });
    expect(closing).toMatchObject({ status: "failed", result: { outcome: "studio_unavailable" } });
  });

  it("önizleme (dryRun) türü yok: iş koşturulmaz", async () => {
    const s = setup();
    const { closing } = await run(produceJob({ dryRun: true }), { sendOrder: s.sendOrder, runStudio: s.runStudio });
    expect(closing?.status).toBe("failed");
    expect(s.studioCalls).toHaveLength(0);
  });
});
