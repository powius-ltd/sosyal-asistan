/**
 * Sözleşme parçası: fikir kartları ve yayın işleri (durum makineleri).
 *
 * Temizlik: her test kendi oluşturduğunu geri alır (yayın işi → `cancelPublishJob`); fikir durumları özgün
 * değere döndürülür. Yayın testleri worker'ın (cron) işi ilerletmediği ayrı bir test workspace'inde koşulur.
 */
import { expect, it } from "vitest";

import { canTransitionIdea, EVIDENCE_CAPTION_MAX, evidenceCaption, IDEA_STATUSES, type IdeaStatus } from "@/lib/domain/intel";
import { CONTENT_FORMATS, PLATFORMS } from "@/lib/domain/platform";
import {
  canApprove,
  canCancel,
  canSubmit,
  CAPTION_MAX,
  HASHTAG_MAX,
  PUBLISH_QUOTA_WINDOW_MS,
  type PublishStatus,
} from "@/lib/domain/publish";
import { MAX_PAGE_LIMIT, type CreatePublishJobInput } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";
import {
  APPROVED_OR_LATER,
  cancelJobs,
  expectCode,
  expectJobsCancelled,
  expectDescending,
  MISSING_ID,
  type ContractContext,
} from "@/lib/data/contract/support";

export function ideasPublishContract(ctx: ContractContext): void {
  const { wsId, create } = ctx;

  async function connectedAccountId(r: PanelRepository): Promise<string> {
    const account = (await r.listOwnAccounts(wsId)).find((a) => a.connection === "connected");
    if (!account) throw new Error("seed: bağlı hesap yok");
    return account.id;
  }

  /** Oluşturulan işleri izler; test sonunda `cancelJobs` ile geri alınır. */
  function tracker(r: PanelRepository) {
    const created: string[] = [];
    return {
      created,
      async make(input: CreatePublishJobInput) {
        const job = await r.createPublishJob(wsId, input);
        created.push(job.id);
        return job;
      },
    };
  }

  it("fikirler: alan kuralları, filtreler, sıralama ve durum geçişleri (canTransitionIdea)", async () => {
    const r = create();
    const ideas = await r.listIdeas(wsId);
    for (const i of ideas) {
      expect(i.workspaceId).toBe(wsId);
      if (i.source !== "manual") {
        // Elle (sohbetten) eklenen fikir kanıtsız ve hook'suz doğar (`manual-ideas` sözleşmesi); kapatılsa da listede kalır.
        expect(i.evidence.length, i.id).toBeGreaterThanOrEqual(2);
        expect(i.hooks.length >= 3 && i.hooks.length <= 5, i.id).toBe(true);
      }
      if (i.hookType !== undefined) expect(i.hookType.trim().length, i.id).toBeGreaterThan(0);
    }
    expectDescending(ideas.map((i) => i.rankScore), "rankScore");
    const pair: IdeaStatus[] = ["new", "dismissed"];
    expect((await r.listIdeas(wsId, { status: pair })).every((i) => pair.includes(i.status))).toBe(true);
    expect((await r.listIdeas(wsId, { limit: 1 })).length).toBeLessThanOrEqual(1);
    expect((await r.getIdea(wsId, ideas[0].id))?.id).toBe(ideas[0].id);
    expect(await r.getIdea(wsId, MISSING_ID)).toBeNull();
    await expectCode(r.updateIdeaStatus(wsId, MISSING_ID, "saved"), "not_found");
    // Geçersiz geçişler reddedilir (durum değişmez).
    for (const i of ideas) {
      for (const to of IDEA_STATUSES.filter((s) => s !== i.status && !canTransitionIdea(i.status, s))) {
        await expectCode(r.updateIdeaStatus(wsId, i.id, to), "invalid_state");
      }
    }
    // Geçerli geçiş + geri alma.
    const reversible = (from: IdeaStatus) => IDEA_STATUSES.find((s) => canTransitionIdea(from, s) && canTransitionIdea(s, from));
    const idea = ideas.find((i) => reversible(i.status) !== undefined);
    const to = idea && reversible(idea.status);
    if (!idea || !to) throw new Error("seed: geri alınabilir durumda fikir yok");
    try {
      expect((await r.updateIdeaStatus(wsId, idea.id, to)).status).toBe(to);
      expect((await r.getIdea(wsId, idea.id))?.status).toBe(to);
    } finally {
      await r.updateIdeaStatus(wsId, idea.id, idea.status);
    }
    expect((await r.getIdea(wsId, idea.id))?.status).toBe(idea.status);
  });

  it("fikirler: durum sayıları listeyle tutarlı (limitten bağımsız); kanıt özeti içerikten türetilir (getContent gerekmez)", async () => {
    const r = create();
    const ideas = await r.listIdeas(wsId, { limit: MAX_PAGE_LIMIT });
    expect(ideas.length, "test workspace'i küçük olmalı: sayım listeden doğrulanır").toBeLessThan(MAX_PAGE_LIMIT);
    const counts = await r.countIdeasByStatus(wsId);
    expect(Object.keys(counts).sort(), "tüm durumlar (0 dahil)").toEqual([...IDEA_STATUSES].sort());
    for (const status of IDEA_STATUSES) expect(counts[status], status).toBe(ideas.filter((i) => i.status === status).length);
    await r.listIdeas(wsId, { limit: 1 });
    expect(await r.countIdeasByStatus(wsId), "liste limiti sayımı etkilemez").toEqual(counts);

    for (const idea of ideas) {
      for (const e of idea.evidence) {
        const label = `${idea.id}/${e.contentItemId}`;
        expect(e.ownerHandle.trim(), label).toBeTruthy();
        expect(PLATFORMS, label).toContain(e.platform);
        expect(CONTENT_FORMATS, label).toContain(e.format);
        if (e.caption !== undefined) {
          expect(Array.from(e.caption).length, label).toBeLessThanOrEqual(EVIDENCE_CAPTION_MAX);
          expect(e.caption, label).not.toMatch(/[\r\n]/);
        }
        // Özet, içeriğin kendisiyle tutarlı (özet okumak için içerik okumak gerekmez ama doğruluk burada sınanır).
        const detail = await r.getContent(wsId, e.contentItemId);
        if (!detail) throw new Error(`kanıt içerik bulunamadı: ${label}`);
        const { item, analysis } = detail;
        expect([e.ownerHandle, e.platform, e.format, e.url], label).toEqual([item.owner.handle, item.platform, item.format, item.url]);
        expect(e.caption, label).toBe(evidenceCaption(item.caption));
        if (item.score.lift === undefined) expect(e.currentLift, `${label} ölçülemeyen lift 0 yazılmaz`).toBeUndefined();
        else expect(e.currentLift, label).toBeCloseTo(item.score.lift, 5);
        expect(e.hookType, label).toBe(analysis?.status === "ok" ? analysis.hookType : undefined);
      }
    }
  });

  it("yayın: onay YALNIZ awaiting_approval'dan, iptal kuralları, oluşturma varsayılanları; onaylayan kaydedilir", async () => {
    const r = create();
    for (const j of await r.listPublishJobs(wsId)) {
      if (APPROVED_OR_LATER.includes(j.status)) {
        expect(j.approvedAt, j.id).toBeDefined();
        expect(j.approvedBy?.trim(), `${j.id}: onaylayan kullanıcı kaydı`).toBeTruthy();
      }
      if (j.approvedAt === undefined) {
        expect(j.approvedBy, `${j.id}: onaysız işte onaylayan yok`).toBeUndefined();
        expect(j.attemptCount, `${j.id}: onaysız iş denenmez`).toBe(0);
      }
      expect(Number.isInteger(j.attemptCount) && j.attemptCount >= 0, j.id).toBe(true);
      if (!canApprove(j.status)) await expectCode(r.approvePublishJob(wsId, j.id), "invalid_state");
      if (!canCancel(j.status, j.containerId)) await expectCode(r.cancelPublishJob(wsId, j.id), "invalid_state");
    }
    const accountId = await connectedAccountId(r);
    const account = (await r.listOwnAccounts(wsId)).find((a) => a.id === accountId);
    const { created, make } = tracker(r);
    try {
      const draft = await make({ socialAccountId: accountId, caption: "Sözleşme testi" });
      expect(draft).toMatchObject({ status: "draft", platform: account?.platform, shareToFeed: true, paidPartnership: false, aiGenerated: false });
      expect(draft.approvedAt).toBeUndefined();
      expect(draft.approvedBy).toBeUndefined();
      expect(draft.attemptCount).toBe(0);
      await expectCode(r.approvePublishJob(wsId, draft.id), "invalid_state");
      expect((await r.cancelPublishJob(wsId, draft.id)).status).toBe("cancelled");
      await expectCode(r.cancelPublishJob(wsId, draft.id), "invalid_state");

      const pending = await make({ socialAccountId: accountId, caption: "Onay bekleyen sözleşme işi", status: "awaiting_approval" });
      expect(pending.status).toBe("awaiting_approval");
      const approved = await r.approvePublishJob(wsId, pending.id);
      expect(approved.status).toBe("approved");
      expect(approved.approvedAt).toBeDefined();
      expect(approved.approvedBy?.trim(), "onaylayan = oturumdaki kullanıcı").toBeTruthy();
      await expectCode(r.approvePublishJob(wsId, pending.id), "invalid_state");
      expect((await r.listPublishJobs(wsId, { status: "approved" })).some((j) => j.id === pending.id)).toBe(true);

      await expectCode(r.createPublishJob(wsId, { socialAccountId: accountId, status: "approved" as unknown as "draft" }), "invalid_input");
      await expectCode(r.createPublishJob(wsId, { socialAccountId: MISSING_ID }), "not_found");
      await expectCode(r.approvePublishJob(wsId, MISSING_ID), "not_found");
      await expectCode(r.cancelPublishJob(wsId, MISSING_ID), "not_found");
      const statuses: PublishStatus[] = ["draft", "published"];
      expect((await r.listPublishJobs(wsId, { status: statuses })).every((j) => statuses.includes(j.status))).toBe(true);
      expect((await r.listPublishJobs(wsId, { socialAccountId: accountId })).every((j) => j.socialAccountId === accountId)).toBe(true);
      expect((await r.listPublishJobs(wsId, { limit: 2 })).length).toBeLessThanOrEqual(2);
    } finally {
      await cancelJobs(r, wsId, created);
    }
    await expectJobsCancelled(r, wsId, created);
  });

  it("yayın: onaya gönder YALNIZ taslaktan; açıklama boşsa invalid_input (oluştururken de); onay değildir", async () => {
    const r = create();
    const accountId = await connectedAccountId(r);
    const { created, make } = tracker(r);
    try {
      const draft = await make({ socialAccountId: accountId, caption: "Onaya gidecek taslak" });
      const submitted = await r.submitPublishJob(wsId, draft.id);
      expect(submitted.status).toBe("awaiting_approval");
      expect([submitted.approvedAt, submitted.approvedBy], "onaya göndermek onay değildir").toEqual([undefined, undefined]);
      expect((await r.listPublishJobs(wsId, { status: "awaiting_approval" })).some((j) => j.id === draft.id)).toBe(true);
      // Artık taslak değil: tekrar gönderilemez; yalnız taslak durumundaki iş gönderilebilir.
      await expectCode(r.submitPublishJob(wsId, draft.id), "invalid_state");
      for (const j of await r.listPublishJobs(wsId)) {
        if (!canSubmit(j.status)) await expectCode(r.submitPublishJob(wsId, j.id), "invalid_state");
      }
      // Onaya gönderilmiş iş yine yalnız insan onayıyla ilerler.
      expect((await r.approvePublishJob(wsId, draft.id)).approvedBy?.trim()).toBeTruthy();

      // Açıklama boş / yalnız boşluk: taslak açılabilir ama onaya gönderilemez; durum değişmez.
      for (const caption of [undefined, "", "   \n "]) {
        const blank = await make({ socialAccountId: accountId, caption });
        await expectCode(r.submitPublishJob(wsId, blank.id), "invalid_input");
        expect((await r.listPublishJobs(wsId, { status: "draft" })).some((j) => j.id === blank.id), JSON.stringify(caption)).toBe(true);
        // Kural oluştururken de depoda: boş açıklamayla awaiting_approval'a açılamaz.
        await expectCode(make({ socialAccountId: accountId, caption, status: "awaiting_approval" }), "invalid_input");
      }
      await expectCode(r.submitPublishJob(wsId, MISSING_ID), "not_found");
    } finally {
      await cancelJobs(r, wsId, created);
    }
    await expectJobsCancelled(r, wsId, created);
  });

  it("yayın özeti: onay bekleyen sayısı ve son 24 saatte yayınlanan iş sayısı işlerle tutarlı (getPublishSummary)", async () => {
    const r = create();
    const jobs = await r.listPublishJobs(wsId, { limit: MAX_PAGE_LIMIT });
    expect(jobs.length, "test workspace'i küçük olmalı: sayım listeden doğrulanır").toBeLessThan(MAX_PAGE_LIMIT);
    const published = jobs.filter((j) => j.status === "published");
    if (published.length === 0) throw new Error("seed: yayınlanmış iş yok");
    const times = published.map((j) => new Date(j.updatedAt).getTime());
    const latest = Math.max(...times);
    const pending = jobs.filter((j) => j.status === "awaiting_approval").length;

    // Pencere (now − 24s, now]: içinde, tam sınırda (dışarıda), dışında ve işlerden ÖNCEKİ bir an (gelecekteki iş sayılmaz).
    const probes = [
      new Date(latest + 3_600_000),
      new Date(latest),
      new Date(latest + PUBLISH_QUOTA_WINDOW_MS),
      new Date(latest + PUBLISH_QUOTA_WINDOW_MS + 1000),
      new Date(Math.min(...times) - 3_600_000),
    ];
    const expectedAt = (now: Date) => {
      const expected: Record<string, number> = {};
      for (const j of published) {
        const at = new Date(j.updatedAt).getTime();
        if (at <= now.getTime() && now.getTime() - at < PUBLISH_QUOTA_WINDOW_MS) expected[j.socialAccountId] = (expected[j.socialAccountId] ?? 0) + 1;
      }
      return expected;
    };
    for (const now of probes) {
      const summary = await r.getPublishSummary(wsId, now);
      expect(summary.publishedLast24hByAccount, now.toISOString()).toEqual(expectedAt(now));
      expect(summary.pendingApproval).toBe(pending);
    }
    expect(Object.keys(expectedAt(probes[0])).length, "pencere içinde en az bir hesabın yayını var").toBeGreaterThan(0);
    expect(expectedAt(probes[3])).toEqual({});

    // Onay bekleyen sayısı yeni işi hemen yansıtır ve iptalde geri döner.
    const accountId = await connectedAccountId(r);
    const { created, make } = tracker(r);
    try {
      await make({ socialAccountId: accountId, caption: "Özet sayımı", status: "awaiting_approval" });
      expect((await r.getPublishSummary(wsId, probes[0])).pendingApproval).toBe(pending + 1);
    } finally {
      await cancelJobs(r, wsId, created);
    }
    await expectJobsCancelled(r, wsId, created);
    expect((await r.getPublishSummary(wsId, probes[0])).pendingApproval).toBe(pending);
  });

  it("yayın: açıklama sınırı depoda da uygulanır — 2200 kod noktası (emoji 1 sayılır) ve 30 hashtag", async () => {
    const r = create();
    const accountId = await connectedAccountId(r);
    const { created, make } = tracker(r);
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#etiket${i}`).join(" ");
    try {
      const emoji = "😀".repeat(CAPTION_MAX); // UTF-16'da 4400 birim ama 2200 karakter
      expect((await make({ socialAccountId: accountId, caption: emoji })).caption).toBe(emoji);
      await expectCode(make({ socialAccountId: accountId, caption: `${emoji}😀` }), "invalid_input");
      await expectCode(make({ socialAccountId: accountId, caption: "a".repeat(CAPTION_MAX + 1) }), "invalid_input");
      expect((await make({ socialAccountId: accountId, caption: tags(HASHTAG_MAX) })).caption).toBeTruthy();
      await expectCode(make({ socialAccountId: accountId, caption: tags(HASHTAG_MAX + 1) }), "invalid_input");
    } finally {
      await cancelJobs(r, wsId, created);
    }
    await expectJobsCancelled(r, wsId, created);
  });
}
