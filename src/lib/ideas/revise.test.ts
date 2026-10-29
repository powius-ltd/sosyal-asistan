/** Sohbetle fikir düzeltme: model sahte alt süreçtir; depo mock. Kural: geçersiz / kilitli durumda HİÇBİR ŞEY yazılmaz. */
import { describe, expect, it } from "vitest";

import { factsContext } from "@/lib/agents/chat/test-support";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { createOrderForIdea } from "@/lib/studio-order/create-for-idea";
import { reviseIdeaFromRequest } from "@/lib/ideas/revise";
import { PANEL_JARGON } from "@/lib/plain-language";
import { REVISE_PLAIN } from "@/lib/plain-language-revise";

const good = {
  hooks: [
    { text: "Bu sabah rutinini bir hafta dene.", type: "question" },
    { text: "Kimse sana ilk beş dakikanın önemini anlatmadı.", type: "bold_claim" },
    { text: "Ben bunu yıllarca atladım.", type: "confession" },
  ],
  outline: ["Sade bir açılış", "Tek fikri anlat", "Denemeye çağır"],
  summary: "Açılışları daha sade ve kısa yazdım.",
};

describe("reviseIdeaFromRequest", () => {
  it("geçerli değişiklik yazılır: yeni açılışlar, eski hâl revisions'ta, durum aynı; sonuç cümlesi düz Türkçe", async () => {
    const ctx = factsContext();
    const before = await ctx.repo.getIdea(ctx.workspaceId, "id_01");
    const llm = createFakeLlm(good);
    const result = await reviseIdeaFromRequest(ctx, llm.backend, "id_01", "Açılışları daha sade yap");
    expect(result.ok).toBe(true);
    expect(result.meta?.billing).toBe("subscription");
    const after = await ctx.repo.getIdea(ctx.workspaceId, "id_01");
    expect(after?.hooks).toEqual(good.hooks.map((h) => h.text));
    expect(after?.scriptOutline).toEqual(good.outline);
    expect(after?.status).toBe(before?.status);
    expect(after?.title).toBe(before?.title);
    expect(after?.details.revisions?.[0]).toMatchObject({ request: "Açılışları daha sade yap", hooks: before?.hooks });
    expect(result.message).toContain(good.summary);
    expect(result.message).not.toMatch(PANEL_JARGON);
  });

  it("model mevcut içeriği aynen geri verirse (iki deneme de) değişiklik yazılmaz, fikir olduğu gibi kalır", async () => {
    const ctx = factsContext();
    const before = await ctx.repo.getIdea(ctx.workspaceId, "id_01");
    if (before === null) throw new Error("seed fikri yok");
    const same = { hooks: before.hooks.map((text) => ({ text, type: "question" })), outline: before.scriptOutline, summary: "Aynı." };
    const result = await reviseIdeaFromRequest(ctx, createFakeLlm(same, same).backend, "id_01", "Değiştir");
    expect(result.ok).toBe(false);
    expect(await ctx.repo.getIdea(ctx.workspaceId, "id_01")).toEqual(before);
  });

  it("bilinmeyen fikir ve bırakılmış fikir: model çağrılmaz", async () => {
    const ctx = factsContext();
    const llm = createFakeLlm(good);
    expect(await reviseIdeaFromRequest(ctx, llm.backend, "id_yok_123", "x")).toMatchObject({ ok: false, message: REVISE_PLAIN.notFound });
    await ctx.repo.updateIdeaStatus(ctx.workspaceId, "id_01", "dismissed");
    expect(await reviseIdeaFromRequest(ctx, llm.backend, "id_01", "x")).toMatchObject({ ok: false, message: REVISE_PLAIN.locked });
    expect(llm.calls).toHaveLength(0);
  });

  it("fişi üretime gönderilmiş fikir değişmez; model çağrılmaz", async () => {
    const ctx = factsContext();
    const llm = createFakeLlm(good);
    const { order } = await createOrderForIdea({ repo: ctx.repo, wsId: ctx.workspaceId, now: ctx.now, ideaId: "id_08", panelSlug: "ornek" });
    await ctx.repo.advanceStudioOrder(ctx.workspaceId, order.id, { status: "uretiliyor" }, ctx.now);
    expect(await reviseIdeaFromRequest(ctx, llm.backend, "id_08", "x")).toMatchObject({ ok: false, message: REVISE_PLAIN.inProduction });
    expect(llm.calls).toHaveLength(0);
  });

  it("model hata verirse fikir değişmez ve kullanıcıya düz bir cümle döner (hata fırlatılmaz)", async () => {
    const ctx = factsContext();
    const before = await ctx.repo.getIdea(ctx.workspaceId, "id_01");
    const llm = createFakeLlm({ hooks: [] }, { hooks: [] });
    const result = await reviseIdeaFromRequest(ctx, llm.backend, "id_01", "x");
    expect(result).toMatchObject({ ok: false, message: REVISE_PLAIN.failed });
    expect(await ctx.repo.getIdea(ctx.workspaceId, "id_01")).toEqual(before);
  });
});
