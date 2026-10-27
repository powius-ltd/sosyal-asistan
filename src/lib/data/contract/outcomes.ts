/**
 * Sözleşme parçası: döngüyü kapatma (Faz 2 kapanış) — fikir ↔ Reels bağı, ölçüm ayarı, "geçen hafta" ve "ölçüm zamanı geldi".
 *
 * Bağ testleri DURUM makinesini sınar (`canConfirmIdeaLink`, `IDEA_TRANSITIONS` dışı `published` geçişi yalnız bağ onayıyla):
 * kısa kod eşleşmesi → `confirmed` + fikir `published`; içerik yoksa `awaiting_content`; geri alma → önceki durum; fikir/içerik
 * başına tek onaylı bağ; `dismissed` fikre bağ yok; başka workspace. Otomatik öneriler sunucu işidir (`suggestIdeaLink` seçeneği).
 *
 * Temizlik: her test kendi bağlarını kaldırır (`unlinkIdea`); fikir durumları özgün değere döner. `rejected` satırlar kalır (aynı
 * çift tekrar önerilmesin diye tasarım gereği) — test her koşuda DAHA ÖNCE bağlanmamış (fikir, içerik) çiftleri seçer, yeniden
 * çalıştırılabilir. Kalıcı bir yan etki: ölçüm tavanı bir kez onaylanınca KALDIRILAMAZ; test onu 0'da (ölçüm kapalı = güvenli) bırakır.
 *
 * `week_review` ve `anatomy` testleri S0'da yalnız ŞEKİL sözleşmesidir (plan olmayan hafta → null, boş ölçüm listesi, serileştirme);
 * gerçek veriyle davranış testlerini A (geçen hafta/ölçüm) ve B (`contract/anatomy.ts`) ekler.
 */
import { expect, it } from "vitest";

import { canConfirmIdeaLink, type Idea, type IdeaStatus } from "@/lib/domain/intel";
import { CHECKPOINT_DAYS } from "@/lib/domain/outcomes";
import { getPlatformModule } from "@/lib/platforms/registry";
import { MAX_CAP_USD } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";
import { expectCode, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";

const NO_CONTENT_CODE_A = "Zz_noContent1";
const NO_CONTENT_CODE_B = "Zz_noContent2";

export function outcomesContract(ctx: ContractContext): void {
  const { wsId, foreign, create } = ctx;
  const reelUrl = (code: string) => `https://www.instagram.com/reel/${code}/?igsh=abc`;

  /** Bağlanabilir fikirler (reddedilmemiş, aktif bağı yok; `published` olmayanlar önce) + daha önce hiç bağlanmamış kendi içerikler. */
  async function world(r: PanelRepository) {
    const [ideas, links, own] = await Promise.all([
      r.listIdeas(wsId, { limit: 200 }),
      r.listIdeaLinks(wsId, { limit: 200 }),
      ctx.allContent(r, { ownerKind: "own" }),
    ]);
    const activeIdeas = new Set(links.filter((l) => l.status === "confirmed" || l.status === "awaiting_content").map((l) => l.ideaId));
    const usedContent = new Set(links.map((l) => l.contentItemId));
    const linkable = ideas
      .filter((i) => canConfirmIdeaLink(i.status) && !activeIdeas.has(i.id))
      .sort((a, b) => Number(a.status === "published") - Number(b.status === "published"));
    const contents = own.filter((c) => c.shortcode !== undefined && !usedContent.has(c.id));
    return { linkable, contents, links };
  }

  const urlOf = (item: { externalId: string; shortcode?: string; platform: Idea["platform"] }) =>
    `${getPlatformModule(item.platform).publicData.contentUrl(item)}?igsh=abc`;
  const statusOf = async (r: PanelRepository, ideaId: string): Promise<IdeaStatus | undefined> => (await r.getIdea(wsId, ideaId))?.status;

  it("ölçüm tavanı: varsayılan onaysız; verilmesi onaydır; geçersiz değer reddedilir; tavan kaldırılamaz", async () => {
    const r = create();
    const before = await r.getWorkspace(wsId);
    if (before?.measureMonthlyCapUsd === undefined) expect(before?.measureCapApprovedAt, "tavan yokken onay zamanı da yok").toBeUndefined();
    for (const bad of [-1, MAX_CAP_USD + 1, Number.NaN, Number.POSITIVE_INFINITY, "0,5", null]) {
      await expectCode(r.updateWorkspace(wsId, { measureMonthlyCapUsd: bad as number }), "invalid_input");
    }
    expect((await r.getWorkspace(wsId))?.measureMonthlyCapUsd, "geçersiz yama durumu değiştirmedi").toBe(before?.measureMonthlyCapUsd);
    try {
      const approved = await r.updateWorkspace(wsId, { measureMonthlyCapUsd: 0.5 });
      expect(approved.measureMonthlyCapUsd).toBe(0.5);
      expect(Number.isNaN(Date.parse(approved.measureCapApprovedAt ?? "")), "verilen tavan onay zamanıyla birlikte yazılır").toBe(false);
      expect((await r.updateWorkspace(wsId, { nicheBrief: "Ölçüm tavanı korunur" })).measureMonthlyCapUsd, "başka alan yaması tavana dokunmaz").toBe(0.5);
    } finally {
      // Tavan kaldırılamaz: güvenli duruma (0 = ölçüm kapalı) bırakılır; onaylı tavan olmayan workspace'te de aynısı.
      expect((await r.updateWorkspace(wsId, { measureMonthlyCapUsd: 0, nicheBrief: before?.nicheBrief ?? "" })).measureMonthlyCapUsd).toBe(0);
    }
    await expectCode(create().updateWorkspace(foreign, { measureMonthlyCapUsd: 1 }), "not_found");
  });

  it("ajan ayarları: geçersiz değer reddedilir; tavan verilmesi onaydır; başka alan yaması dokunmaz; başka workspace", async () => {
    const r = create();
    const before = await r.getWorkspace(wsId);
    if (before?.agentMonthlyCapUsd === undefined) expect(before?.agentCapApprovedAt, "tavan yokken onay zamanı da yok").toBeUndefined();
    for (const bad of [{ agentMonthlyCapUsd: -1 }, { agentMonthlyCapUsd: MAX_CAP_USD + 1 }, { agentMonthlyCapUsd: null }, { collectEveryDays: 0 }, { collectEveryDays: 61 }, { collectVideoLimit: 4 }, { collectVideoLimit: 51 }, { rivalTarget: 11 }, { rivalTarget: 1.5 }]) {
      await expectCode(r.updateWorkspace(wsId, bad as never), "invalid_input");
    }
    const after = await r.getWorkspace(wsId);
    expect(after?.agentMonthlyCapUsd, "geçersiz yama durumu değiştirmedi").toBe(before?.agentMonthlyCapUsd);
    try {
      const approved = await r.updateWorkspace(wsId, { agentMonthlyCapUsd: 2, collectEveryDays: 10, collectVideoLimit: 30, rivalTarget: 2 });
      expect(approved).toMatchObject({ agentMonthlyCapUsd: 2, collectEveryDays: 10, collectVideoLimit: 30, rivalTarget: 2 });
      expect(Number.isNaN(Date.parse(approved.agentCapApprovedAt ?? "")), "verilen tavan onay zamanıyla birlikte yazılır").toBe(false);
      const patched = await r.updateWorkspace(wsId, { nicheBrief: "Ajan ayarı korunur" });
      expect(patched, "başka alan yaması ajan ayarına dokunmaz").toMatchObject({ agentMonthlyCapUsd: 2, collectEveryDays: 10, collectVideoLimit: 30, rivalTarget: 2 });
    } finally {
      // Tavan kaldırılamaz: güvenli duruma (0 = ajan para harcamaz) ve özgün ritme bırakılır.
      const restored = await r.updateWorkspace(wsId, { agentMonthlyCapUsd: 0, collectEveryDays: before?.collectEveryDays ?? 14, collectVideoLimit: before?.collectVideoLimit ?? 25, rivalTarget: before?.rivalTarget ?? 3, nicheBrief: before?.nicheBrief ?? "" });
      expect(restored.agentMonthlyCapUsd).toBe(0);
    }
    await expectCode(create().updateWorkspace(foreign, { agentMonthlyCapUsd: 1 }), "not_found");
  });

  it("bağ: geçersiz girdi, bilinmeyen kayıt ve başka workspace", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "idea_links", () => r.listIdeaLinks(wsId));
    const { linkable } = await world(r);
    if (linkable.length === 0) throw new Error("seed: bağlanabilir fikir yok");
    const ideaId = linkable[0].id;

    for (const url of ["", "   ", "bu bir link değil", "https://example.com/reel/abcdefghijk/", "https://www.instagram.com/ornek/", "ftp://www.instagram.com/reel/abcdefghijk/"]) {
      await expectCode(r.linkIdeaToReel(wsId, { ideaId, url }), "invalid_input");
    }
    await expectCode(r.linkIdeaToReel(wsId, { ideaId: "", url: reelUrl("abcdefghijk") }), "invalid_input");
    await expectCode(r.linkIdeaToReel(wsId, { ideaId: MISSING_ID, url: reelUrl("abcdefghijk") }), "not_found");
    await expectCode(r.resolveIdeaLink(wsId, MISSING_ID, "confirm"), "not_found");
    await expectCode(r.resolveIdeaLink(wsId, MISSING_ID, "approve" as "confirm"), "invalid_input");
    await expectCode(r.unlinkIdea(wsId, MISSING_ID), "not_found");
    await expectCode(r.unlinkIdea(wsId, ideaId), "not_found"); // aktif bağı yok
    expect((await r.getIdea(wsId, ideaId))?.reelLink).toBeUndefined();

    // Başka (var olmayan) workspace: okuma boş, yazma not_found.
    expect(await r.listIdeaLinks(foreign)).toEqual([]);
    await expectCode(r.linkIdeaToReel(foreign, { ideaId, url: reelUrl("abcdefghijk") }), "not_found");
    await expectCode(r.resolveIdeaLink(foreign, MISSING_ID, "reject"), "not_found");
    await expectCode(r.unlinkIdea(foreign, ideaId), "not_found");
    expect(await r.listIdeaLinks(wsId, { ideaId: MISSING_ID }), "bilinmeyen fikir → boş liste").toEqual([]);
  });

  it("bağ: kısa kod kendi içerikle eşleşirse confirmed + fikir published; tekrar idempotent; ikinci onaylı bağ reddedilir; geri alma önceki duruma döndürür", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "idea_links", () => r.listIdeaLinks(wsId));
    const { linkable, contents } = await world(r);
    const [ideaA, ideaB] = linkable.filter((i) => i.status !== "published");
    if (!ideaA || !ideaB || contents.length < 2) throw new Error("seed: ≥2 bağlanabilir (published olmayan) fikir ve ≥2 kısa kodlu kendi içerik gerekir");
    const [first, second] = contents;
    const original = ideaA.status;
    let linked = false;
    try {
      const link = await r.linkIdeaToReel(wsId, { ideaId: ideaA.id, url: urlOf(first) });
      linked = true;
      expect(link).toMatchObject({ ideaId: ideaA.id, status: "confirmed", origin: "manual_url", shortcode: first.shortcode, contentItemId: first.id });
      expect(link.content?.contentItemId).toBe(first.id);
      expect(link.score, "elle linkte skor yok (0 değil)").toBeUndefined();
      const after = await r.getIdea(wsId, ideaA.id);
      expect(after?.status, "onaylı bağ fikri published yapar").toBe("published");
      expect(after?.reelLink).toMatchObject({ linkId: link.id, status: "confirmed", shortcode: first.shortcode, contentItemId: first.id });
      expect((await r.listIdeas(wsId, { status: "published", limit: 200 })).some((i) => i.id === ideaA.id)).toBe(true);
      expect(await r.listIdeaLinks(wsId, { ideaId: ideaA.id, status: "confirmed" })).toHaveLength(1);

      // Idempotent: aynı bağlantı aynı satırı döndürür.
      expect((await r.linkIdeaToReel(wsId, { ideaId: ideaA.id, url: urlOf(first) })).id).toBe(link.id);
      // Fikir başına tek onaylı bağ; içerik başına tek onaylı bağ.
      await expectCode(r.linkIdeaToReel(wsId, { ideaId: ideaA.id, url: urlOf(second) }), "already_exists");
      await expectCode(r.linkIdeaToReel(wsId, { ideaId: ideaB.id, url: urlOf(first) }), "already_exists");
      expect(await statusOf(r, ideaB.id), "reddedilen bağ ikinci fikre dokunmadı").toBe(ideaB.status);
      // Onaylı bağ "öneri" olarak çözülemez.
      await expectCode(r.resolveIdeaLink(wsId, link.id, "reject"), "invalid_state");

      // Geri alma: fikir önceki duruma döner, bağ satırı reddedildi olarak kalır.
      const unlinked = await r.unlinkIdea(wsId, ideaA.id);
      linked = false;
      expect(unlinked.status, "geri alma önceki durumu geri getirir").toBe(original);
      expect(unlinked.reelLink).toBeUndefined();
      expect((await r.listIdeaLinks(wsId, { ideaId: ideaA.id })).find((l) => l.id === link.id)?.status).toBe("rejected");
      await expectCode(r.unlinkIdea(wsId, ideaA.id), "not_found");

      // Reddedilen çift kullanıcı linkiyle yeniden bağlanabilir: aynı satır yeniden kullanılır.
      const again = await r.linkIdeaToReel(wsId, { ideaId: ideaA.id, url: urlOf(first) });
      linked = true;
      expect(again).toMatchObject({ id: link.id, status: "confirmed" });
      expect(await statusOf(r, ideaA.id)).toBe("published");
    } finally {
      if (linked) await r.unlinkIdea(wsId, ideaA.id);
    }
    expect(await statusOf(r, ideaA.id), "test fikri özgün durumuna döndürdü").toBe(original);
  });

  it("bağ: içerik henüz yoksa awaiting_content (fikir değişmez); yeni link eskisinin yerine geçer; kaldırma satırı siler", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "idea_links", () => r.listIdeaLinks(wsId));
    const { linkable } = await world(r);
    const idea = linkable.find((i) => i.status !== "published");
    if (!idea) throw new Error("seed: bağlanabilir fikir yok");
    try {
      const waiting = await r.linkIdeaToReel(wsId, { ideaId: idea.id, url: reelUrl(NO_CONTENT_CODE_A) });
      expect(waiting).toMatchObject({ ideaId: idea.id, status: "awaiting_content", origin: "manual_url", shortcode: NO_CONTENT_CODE_A });
      expect(waiting.contentItemId).toBeUndefined();
      expect(waiting.content).toBeUndefined();
      const card = await r.getIdea(wsId, idea.id);
      expect(card?.status, "bekleyen link fikir durumunu değiştirmez").toBe(idea.status);
      expect(card?.reelLink).toMatchObject({ linkId: waiting.id, status: "awaiting_content", shortcode: NO_CONTENT_CODE_A });
      expect((await r.linkIdeaToReel(wsId, { ideaId: idea.id, url: reelUrl(NO_CONTENT_CODE_A) })).id, "idempotent").toBe(waiting.id);

      // Farklı kodlu yeni link bekleyen bağın yerine geçer (fikir başına tek aktif bağ).
      const replaced = await r.linkIdeaToReel(wsId, { ideaId: idea.id, url: reelUrl(NO_CONTENT_CODE_B) });
      expect(replaced).toMatchObject({ status: "awaiting_content", shortcode: NO_CONTENT_CODE_B });
      const active = (await r.listIdeaLinks(wsId, { ideaId: idea.id, status: "awaiting_content" })).map((l) => l.shortcode);
      expect(active).toEqual([NO_CONTENT_CODE_B]);

      // Bekleyen bağ öneri değildir: onay/ret çözemez.
      await expectCode(r.resolveIdeaLink(wsId, replaced.id, "confirm"), "invalid_state");
      const unlinked = await r.unlinkIdea(wsId, idea.id);
      expect(unlinked.reelLink).toBeUndefined();
      expect(unlinked.status).toBe(idea.status);
      expect(await r.listIdeaLinks(wsId, { ideaId: idea.id, status: "awaiting_content" }), "bekleyen bağ kaldırılınca satır silinir").toEqual([]);
    } finally {
      if ((await r.getIdea(wsId, idea.id))?.reelLink) await r.unlinkIdea(wsId, idea.id);
    }
  });

  it("bağ: reddedilmiş (dismissed) fikre Reels bağlanamaz", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "idea_links", () => r.listIdeaLinks(wsId));
    const { linkable, contents } = await world(r);
    const idea = linkable.find((i) => i.status === "new");
    if (!idea || contents.length === 0) throw new Error("seed: 'new' durumunda bağlanabilir fikir ve kendi içerik gerekir");
    await r.updateIdeaStatus(wsId, idea.id, "dismissed");
    try {
      await expectCode(r.linkIdeaToReel(wsId, { ideaId: idea.id, url: urlOf(contents[0]) }), "invalid_state");
      await expectCode(r.linkIdeaToReel(wsId, { ideaId: idea.id, url: reelUrl(NO_CONTENT_CODE_A) }), "invalid_state");
      expect((await r.getIdea(wsId, idea.id))?.status).toBe("dismissed");
    } finally {
      await r.updateIdeaStatus(wsId, idea.id, "new");
    }
  });

  it("öneri: onay → confirmed + fikir published (geri alınabilir); ret → rejected, fikre dokunmaz; bayat öneri → already_exists", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "idea_links", () => r.listIdeaLinks(wsId));
    const { linkable, contents } = await world(r);
    const candidates = linkable.filter((i) => i.status !== "published");
    const [ideaA, ideaB] = candidates;
    const ideaC = linkable.find((i) => i.id !== ideaA?.id && i.id !== ideaB?.id);
    if (!ideaA || !ideaB || !ideaC || contents.length < 1) throw new Error("seed: ≥3 bağlanabilir fikir (≥2'si published olmayan) ve ≥1 kısa kodlu kendi içerik gerekir");
    const content = contents[0];
    const originalB = ideaB.status;
    let linkedB = false;
    try {
      // Sessiz bağ YOK: öneri yalnız öneridir; fikir kartında aktif bağ görünmez, durum değişmez.
      const rejectedId = await ctx.suggestIdeaLink(r, { ideaId: ideaA.id, contentItemId: content.id });
      const suggestions = await r.listIdeaLinks(wsId, { status: "suggested" });
      const suggestion = suggestions.find((l) => l.id === rejectedId);
      expect(suggestion).toMatchObject({ ideaId: ideaA.id, status: "suggested", origin: "auto_match", contentItemId: content.id, shortcode: content.shortcode });
      expect(suggestion?.score !== undefined && suggestion.score >= 0 && suggestion.score <= 1).toBe(true);
      expect(suggestion?.reasons.length).toBeGreaterThan(0);
      expect(suggestion?.content?.contentItemId).toBe(content.id);
      const untouched = await r.getIdea(wsId, ideaA.id);
      expect([untouched?.status, untouched?.reelLink]).toEqual([ideaA.status, undefined]);

      // Ret: satır reddedildi, fikre dokunulmaz; ikinci karar geçersiz.
      expect(await r.resolveIdeaLink(wsId, rejectedId, "reject")).toMatchObject({ id: rejectedId, status: "rejected" });
      expect((await r.getIdea(wsId, ideaA.id))?.status).toBe(ideaA.status);
      await expectCode(r.resolveIdeaLink(wsId, rejectedId, "confirm"), "invalid_state");
      expect(await r.listIdeaLinks(wsId, { ideaId: ideaA.id, status: "suggested" })).toEqual([]);

      // Onay: bağ confirmed, fikir published.
      const confirmId = await ctx.suggestIdeaLink(r, { ideaId: ideaB.id, contentItemId: content.id });
      const confirmed = await r.resolveIdeaLink(wsId, confirmId, "confirm");
      linkedB = true;
      expect(confirmed).toMatchObject({ id: confirmId, status: "confirmed", contentItemId: content.id });
      const cardB = await r.getIdea(wsId, ideaB.id);
      expect(cardB?.status).toBe("published");
      expect(cardB?.reelLink).toMatchObject({ linkId: confirmId, status: "confirmed" });

      // Bayat öneri: içerik artık başka fikre onaylı → onay reddedilir (ret yine mümkün).
      const staleId = await ctx.suggestIdeaLink(r, { ideaId: ideaC.id, contentItemId: content.id });
      await expectCode(r.resolveIdeaLink(wsId, staleId, "confirm"), "already_exists");
      expect((await r.resolveIdeaLink(wsId, staleId, "reject")).status).toBe("rejected");
      expect(await statusOf(r, ideaC.id), "reddedilen bayat öneri fikre dokunmadı").toBe(ideaC.status);

      // Geri alma önceki durumu getirir.
      expect((await r.unlinkIdea(wsId, ideaB.id)).status).toBe(originalB);
      linkedB = false;
    } finally {
      if (linkedB) await r.unlinkIdea(wsId, ideaB.id);
    }
  });

  it("listMeasurementDue: ölçüm penceresi açık Reels'ler (şekil sözleşmesi); bilinmeyen workspace → boş", async (t) => {
    const r = create();
    const now = new Date();
    await ctx.skipIfPending(t, "week_review", () => r.listMeasurementDue(wsId, now));
    expect(await r.listMeasurementDue(foreign, now)).toEqual([]);
    const due = await r.listMeasurementDue(wsId, now);
    for (const item of due) {
      expect(CHECKPOINT_DAYS, item.contentItemId).toContain(item.day);
      expect(Date.parse(item.windowEnd), "pencere sonu başından sonra").toBeGreaterThan(Date.parse(item.windowStart));
      expect(Date.parse(item.publishedAt), "yayın tarihi ISO").not.toBeNaN();
      expect(item.ownerHandle.startsWith("@"), "kullanıcı adı '@'sız").toBe(false);
    }
    const published = due.map((d) => Date.parse(d.publishedAt));
    expect(published, "yayın tarihine göre eskiden yeniye").toEqual([...published].sort((a, b) => a - b));
    expect(new Set(due.map((d) => d.contentItemId)).size, "pencereler ayrık: içerik başına en çok bir bekleyen nokta").toBe(due.length);
  });

  it("getWeekReview: plan olmayan hafta/bilinmeyen workspace → null; biçimsiz gün → invalid_input (şekil sözleşmesi)", async (t) => {
    const r = create();
    const now = new Date();
    await ctx.skipIfPending(t, "week_review", () => r.getWeekReview(wsId, "1999-01-04", now));
    expect(await r.getWeekReview(wsId, "1999-01-04", now), "plan yok → null (0 sonuç değil)").toBeNull();
    expect(await r.getWeekReview(foreign, "1999-01-04", now)).toBeNull();
    for (const bad of ["", "bugün", "2026-02-31", "2026/09/28"]) await expectCode(r.getWeekReview(wsId, bad, now), "invalid_input");
  });

  it("getWeekReview: planlı fikre Reels bağlanınca öğe bağı + 3 kontrol noktası taşır; D+7 dışında lift yok; ölçülemeyen = undefined (0 değil)", async (t) => {
    const r = create();
    const now = new Date();
    await ctx.skipIfPending(t, "week_review", () => r.getWeekReview(wsId, "1999-01-04", now));
    await ctx.skipIfPending(t, "idea_links", () => r.listIdeaLinks(wsId));
    const [summary] = await r.listWeeklyPlans(wsId);
    const plan = summary && (await r.getWeeklyPlan(wsId, summary.weekStart));
    const { contents } = await world(r);
    const content = contents.find((c) => c.publishedAt !== undefined);
    const idea = plan ? plan.items.map((i) => i.idea).find((i) => canConfirmIdeaLink(i.status) && i.status !== "published" && i.reelLink === undefined) : undefined;
    if (!plan || !idea || !content) throw new Error("seed: planda bağlanabilir fikir ve yayın tarihli, bağlanmamış kendi içerik gerekir");

    const before = await r.getWeekReview(wsId, plan.weekStart, now);
    expect(before?.items.find((i) => i.ideaId === idea.id)).toMatchObject({ link: undefined, checkpoints: [], directions: [] });
    try {
      await r.linkIdeaToReel(wsId, { ideaId: idea.id, url: urlOf(content) });
      const review = await r.getWeekReview(wsId, plan.weekStart, now);
      expect(review?.weekStart).toBe(plan.weekStart);
      expect(review?.summary.planned).toBe(plan.items.length);
      expect(review?.summary.linked).toBeGreaterThanOrEqual(1);
      const item = review?.items.find((i) => i.ideaId === idea.id);
      expect(item?.link).toMatchObject({ status: "confirmed", contentItemId: content.id });
      expect(item?.publishedAt).toBe(new Date(content.publishedAt as string).toISOString());
      expect(item?.checkpoints.map((c) => c.day)).toEqual([1, 3, 7]);
      for (const point of item?.checkpoints ?? []) {
        if (point.day !== 7) expect([point.lift, point.liftTier], `D+${point.day}'te lift olmaz`).toEqual([undefined, undefined]);
        if (point.status !== "measured") expect([point.views, point.lift], `D+${point.day} ${point.status}: sayı yok (0 değil)`).toEqual([undefined, undefined]);
      }
      for (const direction of item?.directions ?? []) {
        if (direction.verdict === "unmeasured") expect(direction.reason, "ölçülemeyen hükmün sebebi var").toBeTruthy();
      }
    } finally {
      if ((await r.getIdea(wsId, idea.id))?.reelLink) await r.unlinkIdea(wsId, idea.id);
    }
    expect((await r.getIdea(wsId, idea.id))?.status, "test fikri özgün durumuna döndürdü").toBe(idea.status);
  });
}
