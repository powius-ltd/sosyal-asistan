/** Sohbet `revise_video` (SPN-36 G5): model not ÖNERİR, sunucu fişi doğrular; sohbet revize BAŞLATMAZ (fiş, sürüm, yayın satırı değişmez). */
import { describe, expect, it } from "vitest";

import { parseChatEvent, type ChatEvent } from "@/lib/agents/chat/events";
import { handleChatRequest, type ChatHandlerDeps } from "@/lib/agents/chat/handle";
import { createChatLock } from "@/lib/agents/chat/lock";
import { buildChatSystemPrompt } from "@/lib/agents/chat/prompt";
import { NOOP_RUN_RECORDER } from "@/lib/agents/chat/run-record";
import type { ChatOutput } from "@/lib/agents/chat/schema";
import { factsContext, goodOutput, mockFacts } from "@/lib/agents/chat/test-support";
import { verifyChatOutput } from "@/lib/agents/chat/verify";
import { createFakeLlm } from "@/lib/llm/backend-fake";

const command = (videoRevision: ChatOutput["videoRevision"]): ChatOutput => goodOutput({ kind: "out_of_scope", text: "Notu aldım.", evidence: [], command: "revise_video", videoRevision });

function post(): Request {
  return new Request("http://localhost:3100/api/sohbet", { method: "POST", headers: { "content-type": "application/json", host: "localhost:3100" }, body: JSON.stringify({ question: "videonun sonunu değiştir" }) });
}

/** Üretilmiş fiş (+ isteğe bağlı onay bekleyen yayın satırı) kurar. */
async function producedOrder(suffix: string, withPublish = true) {
  const ctx = factsContext();
  const { repo, workspaceId: wsId, now } = ctx;
  const idea = await repo.createManualIdea(wsId, { title: `Sohbet revize ${suffix}`, note: "Test." }, now);
  const siparisId = `sohbet-revize-${suffix}`;
  const order = await repo.createStudioOrder(
    wsId,
    { ideaId: idea.id, ticket: { siparis_id: siparisId, fikir_id: idea.id, plan_hafta: "2026-10-26", hesap: "test", mod: "konu", sutun: "Test", istenen_saat: "2026-10-30 18:00", onay: false, durum: "taslak", konu: "Konu", ana_hat: ["a", "b"] } as never },
    now,
  );
  await repo.advanceStudioOrder(wsId, order.id, { status: "uretiliyor" }, now);
  await repo.advanceStudioOrder(wsId, order.id, { status: "uretildi", video: `${siparisId}/final.mp4` }, now);
  if (withPublish) {
    const account = (await repo.listOwnAccounts(wsId)).find((a) => a.connection === "connected");
    if (!account) throw new Error("Bağlı hesap yok (mock veri).");
    await repo.createPublishJob(wsId, { socialAccountId: account.id, caption: "Açıklama", orderId: siparisId, status: "awaiting_approval" });
  }
  return { ctx, order };
}

async function run(output: ChatOutput, ctx: ReturnType<typeof factsContext>): Promise<string> {
  const deps: ChatHandlerDeps = {
    availability: () => ({ available: true }),
    getContext: async () => ctx,
    createBackend: () => createFakeLlm(output, output).backend,
    recorder: NOOP_RUN_RECORDER,
    lock: createChatLock(),
    collect: async () => mockFacts(),
  };
  const events = (await (await handleChatRequest(post(), deps)).text()).split("\n").map(parseChatEvent).filter((e): e is ChatEvent => e !== undefined);
  const last = events.at(-1);
  return last?.type === "answer" ? last.text : "";
}

describe("sohbet revise_video (G5)", () => {
  it("üretilmiş + onay bekleyen video: not önerilir, onay kartına yönlendirilir, hiçbir şey başlamaz", async () => {
    const { ctx, order } = await producedOrder("a");
    const jobsBefore = (await ctx.repo.listJobs(ctx.workspaceId, {})).length;
    const text = await run(command({ orderId: order.id, note: "Sondaki yazı yanlış" }), ctx);
    expect(text).toContain("Sondaki yazı yanlış");
    expect(text).toContain("Revize iste");
    expect(text).toContain("3 revize hakkın var");
    const after = await ctx.repo.getStudioOrder(ctx.workspaceId, order.id);
    expect(after).toMatchObject({ status: "uretildi", revision: 1 });
    expect(after?.ticket.revize_notu).toBeUndefined();
    expect((await ctx.repo.listPublishJobs(ctx.workspaceId, { status: "cancelled" })).some((j) => j.orderId === order.ticket.siparis_id)).toBe(false);
    expect(await ctx.repo.listJobs(ctx.workspaceId, {})).toHaveLength(jobsBefore);
  });

  it("uydurma fiş kimliği reddedilir", async () => {
    const { ctx } = await producedOrder("b");
    expect(await run(command({ orderId: "yok-boyle-fis", note: "Not" }), ctx)).toMatch(/fişlerinde görünmüyor/);
  });

  it("üretilmemiş fiş: neden söylenir", async () => {
    const ctx = factsContext();
    const idea = await ctx.repo.createManualIdea(ctx.workspaceId, { title: "Taslak fiş", note: "Test." }, ctx.now);
    const order = await ctx.repo.createStudioOrder(
      ctx.workspaceId,
      { ideaId: idea.id, ticket: { siparis_id: "sohbet-revize-c", fikir_id: idea.id, plan_hafta: "2026-10-26", hesap: "test", mod: "konu", sutun: "Test", istenen_saat: "2026-10-30 18:00", onay: false, durum: "taslak", konu: "Konu", ana_hat: ["a", "b"] } as never },
      ctx.now,
    );
    expect(await run(command({ orderId: order.id, note: "Not" }), ctx)).toMatch(/henüz üretilmedi/);
  });

  it("onay bekleyen yayın satırı yoksa revize önerilmez", async () => {
    const { ctx, order } = await producedOrder("d", false);
    expect(await run(command({ orderId: order.id, note: "Not" }), ctx)).toMatch(/onay beklemiyor/);
  });

  it("şekil kuralı: revise_video videoRevision ister, videoRevision başka komutla verilmez", async () => {
    const facts = await mockFacts();
    expect(verifyChatOutput(command(undefined), facts).join(" ")).toMatch(/revise_video.*videoRevision/);
    const stray = goodOutput({ kind: "out_of_scope", text: "Tamam.", evidence: [], videoRevision: { orderId: "x", note: "y" } });
    expect(verifyChatOutput(stray, facts).join(" ")).toMatch(/videoRevision yalnız/);
    expect(verifyChatOutput(command({ orderId: "x", note: "y" }), facts)).toEqual([]);
  });

  it("istem komutu ve 'başlatamazsın' kuralını söyler", () => {
    const prompt = buildChatSystemPrompt("business");
    expect(prompt).toContain("revise_video");
    expect(prompt).toContain("videoRevision");
  });
});
