import { describe, expect, it, vi } from "vitest";

import { IDEA_STATUSES } from "@/lib/domain/intel";
import { PUBLISH_STATUSES } from "@/lib/domain/publish";
import { RepositoryError } from "@/lib/data/repository";
import { runRepositoryContract } from "@/lib/data/repository.contract";
import { buildMockDataset } from "@/lib/data/mock/generators/dataset";
import { METRIC_FIELDS } from "@/lib/data/mock/generators/metrics";
import { createClock } from "@/lib/data/mock/mock-clock";
import { DAY_MS } from "@/lib/time";
import { createMockRepository, type MockPanelRepository } from "@/lib/data/mock/mock-repository";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

// Konu eleği sonucu depo üzerinden yazılamaz: niş dışı içerikleri (deterministik) veri kümesi bilir.
// Otomatik eşleşme önerisi sunucu işidir (depo üzerinden yazılamaz): mock bunu `testing` kancasıyla verir.
// Panel işleri test kuyruğuna yazılır; işi almak / bitirmek işçinin işidir: mock bunu da `testing` kancasıyla verir.
const JOB_QUEUE = "contract_mock";
runRepositoryContract("mock", () => createMockRepository(undefined, { jobQueue: JOB_QUEUE }), {
  wsId: WS,
  offNicheContentIds: () => data.topicScreens.filter((s) => !s.inNiche).map((s) => s.contentItemId),
  suggestIdeaLink: async (repo, input) => (repo as MockPanelRepository).testing.suggestIdeaLink(input),
  jobQueue: JOB_QUEUE,
  createEnforced: () => createMockRepository(undefined, { jobQueue: JOB_QUEUE, creditsEnforced: true }),
  // Başlangıç akışı: mock hesabı TAZE sayan ayrı depo (tohum verisi akışın olgusu değildir; işçisiz ilerleme kapalı).
  freshWorkspace: async () => ({ repo: createMockRepository(undefined, { jobQueue: JOB_QUEUE, onboarding: { start: "add_account" } }), wsId: WS }),
  jobWorker: {
    claim: async (repo) => (repo as MockPanelRepository).testing.claimJob(),
    finish: async (repo, jobId) => (repo as MockPanelRepository).testing.finishJob(jobId),
  },
  creditOps: {
    grant: async (repo, input) => (repo as MockPanelRepository).testing.grantCredits(input),
    settle: async (repo, input) => (repo as MockPanelRepository).testing.settleCredits(input),
  },
});

const clock = createClock();
const data = buildMockDataset(clock);
const age = (iso: string | undefined) => (iso ? (clock.nowMs - new Date(iso).getTime()) / DAY_MS : NaN);
const competitorItems = data.content.filter((c) => c.owner.kind === "competitor");

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: "RepositoryError", code });
}

describe("mock veri: hacim ve kurgu", () => {
  it("1 workspace (Europe/Istanbul), 2 kendi hesap: biri connected, biri scrape_only", () => {
    expect(data.workspace.timezone).toBe("Europe/Istanbul");
    expect(data.workspace.apifyMonthlyCapUsd).toBe(10);
    expect(data.ownAccounts.map((a) => a.connection).sort()).toEqual(["connected", "scrape_only"]);
  });

  it("12 rakip: 1 private, 1 not_found, related/search kaynaklı adaylar", () => {
    const by = (s: string) => data.competitors.filter((c) => c.status === s);
    expect(data.competitors).toHaveLength(12);
    expect(by("private")).toHaveLength(1);
    expect(by("not_found")).toHaveLength(1);
    expect(by("candidate").length).toBeGreaterThanOrEqual(2);
    expect(new Set(by("candidate").map((c) => c.source))).toEqual(new Set(["related", "search"]));
    expect(by("not_found")[0].followers).toBeUndefined();
  });

  it("~300 içerik son 90 günde; çoğu kısa video, karusel ve görsel de var; ci_001 kendi hesabın", () => {
    expect(data.content.length).toBeGreaterThanOrEqual(280);
    expect(data.content.length).toBeLessThanOrEqual(320);
    const count = (f: string) => data.content.filter((c) => c.format === f).length;
    expect(count("short_video")).toBeGreaterThan(data.content.length / 2);
    expect(count("carousel")).toBeGreaterThan(0);
    expect(count("image")).toBeGreaterThan(0);
    expect(data.content.every((c) => age(c.publishedAt) >= 0 && age(c.publishedAt) <= 90)).toBe(true);
    expect(data.content.find((c) => c.id === "ci_001")?.owner.kind).toBe("own");
    for (const c of data.competitors) {
      expect(c.contentCount, c.handle).toBe(competitorItems.filter((x) => x.owner.id === c.id).length);
    }
  });

  it("viewsKind: rakipte ig_play_count ve ig_view_count ayrı, bağlı kendi hesapta ig_views", () => {
    const kinds = new Set(competitorItems.map((c) => c.metrics.viewsKind).filter(Boolean));
    expect(kinds).toEqual(new Set(["ig_play_count", "ig_view_count"]));
    const connected = data.ownAccounts.find((a) => a.connection === "connected");
    const own = data.content.filter((c) => c.owner.id === connected?.id);
    expect(own.every((c) => c.metrics.viewsKind === "ig_views")).toBe(true);
  });
});

describe("mock veri: rakip özetleri", () => {
  it("takipteki rakiplerde dört istatistik de dolu; içeriği toplanmayan rakipte hiçbiri yok", () => {
    for (const c of data.competitors.filter((x) => x.status === "tracked")) {
      expect([c.followersDelta7d, c.medianViews, c.outlierCount, c.postsPerWeek].every((v) => v !== undefined), c.handle).toBe(true);
      expect(c.outlierCount as number).toBeLessThanOrEqual(c.contentCount);
    }
    for (const status of ["not_found", "private", "candidate"]) {
      for (const c of data.competitors.filter((x) => x.status === status)) {
        expect([c.followersDelta7d, c.medianViews, c.outlierCount, c.postsPerWeek], c.handle).toEqual([undefined, undefined, undefined, undefined]);
      }
    }
  });

  it("yeni eklenen rakipte istatistikler ölçülemedi (0 değil)", async () => {
    const added = await createMockRepository().addCompetitor(WS, { platform: "instagram", handle: "yeni.rakip" });
    expect([added.followersDelta7d, added.medianViews, added.outlierCount, added.postsPerWeek]).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe("mock veri: ölçülemeyen ≠ 0", () => {
  it("metrik alanlarının ≥%5'i undefined; gerçek 0'lar da var", () => {
    const values = data.content.flatMap((c) => METRIC_FIELDS.map((f) => c.metrics[f]));
    expect(values.filter((v) => v === undefined).length / values.length).toBeGreaterThanOrEqual(0.05);
    expect(values.some((v) => v === 0)).toBe(true);
  });

  it("rakipte saves/reach/avgWatchSec hiç yok; bazı rakip içeriklerinde beğeni gizli; karuselde izlenme yok", () => {
    for (const f of ["saves", "reach", "avgWatchSec"] as const) {
      expect(competitorItems.every((c) => c.metrics[f] === undefined), f).toBe(true);
    }
    expect(competitorItems.some((c) => c.metrics.likes === undefined && c.missingFields.includes("likes"))).toBe(true);
    const posts = competitorItems.filter((c) => c.format !== "short_video");
    expect(posts.every((c) => c.metrics.views === undefined && c.score.lift === undefined)).toBe(true);
  });
});

describe("mock veri: skorlar", () => {
  it("≥10 içerik lift ≥ 3 (rakiplerde de ≥10), birkaçı ≥ 5x", () => {
    const lift = (min: number, list = data.content) => list.filter((c) => (c.score.lift ?? 0) >= min).length;
    expect(lift(3)).toBeGreaterThanOrEqual(10);
    expect(lift(3, competitorItems)).toBeGreaterThanOrEqual(10);
    expect(lift(5)).toBeGreaterThanOrEqual(3);
  });

  it("baz çizgisi: aynı hesap+format+viewsKind, pinned ve <3 gün hariç, en yeni 25'in medyanı", async () => {
    const repo = createMockRepository();
    const byId = new Map(data.content.map((c) => [c.id, c]));
    for (const item of data.content.filter((c) => c.score.lift !== undefined)) {
      const detail = await repo.getContent(WS, item.id);
      const basis = detail?.baseline.basis.map((b) => byId.get(b.contentItemId)) ?? [];
      expect(basis.length, item.id).toBe(item.score.baselineN);
      expect(basis.length).toBeLessThanOrEqual(25);
      for (const b of basis) {
        expect(b && b.owner.id === item.owner.id && b.format === item.format, item.id).toBe(true);
        expect(b?.metrics.viewsKind).toBe(item.metrics.viewsKind);
        expect(b?.isPinned).toBeUndefined();
        expect(age(b?.publishedAt)).toBeGreaterThanOrEqual(3);
      }
      const dates = basis.map((b) => b?.publishedAt ?? "");
      expect(dates).toEqual([...dates].sort().reverse());
    }
  });

  it("crossScore = ln(views/takipçi) × ln(takipçi); immature <3 gün; lowConfidence n<10", () => {
    for (const c of data.content) {
      expect(c.score.immature, c.id).toBe(age(c.publishedAt) < 3);
      if (c.score.lift !== undefined) expect(c.score.lowConfidence).toBe((c.score.baselineN ?? 0) < 10);
      const { views } = c.metrics;
      const f = c.owner.followers;
      if (views === undefined || f === undefined || views <= 0) expect(c.score.crossScore).toBeUndefined();
      else expect(c.score.crossScore, c.id).toBeCloseTo(Math.log(views / f) * Math.log(f), 1);
    }
    expect(data.content.some((c) => c.score.lowConfidence && c.score.lift !== undefined)).toBe(true);
    expect(data.content.some((c) => c.score.immature)).toBe(true);
    expect(data.content.some((c) => c.isPinned)).toBe(true);
  });
});

describe("mock veri: zaman serileri", () => {
  it("içerik snapshot'ları: izlenme tekdüze artan, ilk günlerde hızlı; son snapshot = son metrikler", () => {
    for (const c of data.content) {
      const snaps = data.snapshots.filter((s) => s.contentItemId === c.id);
      expect(snaps.length, c.id).toBeGreaterThan(0);
      const views = snaps.map((s) => s.views).filter((v): v is number => v !== undefined);
      expect(views).toEqual([...views].sort((a, b) => a - b));
      const last = snaps[snaps.length - 1];
      expect([last.capturedAt, last.views, last.likes]).toEqual([c.metrics.capturedAt, c.metrics.views, c.metrics.likes]);
    }
    // Olgun içerikte (resmi API, yayından hemen sonra izleniyor) ilk ~3,5 günde toplamın yarısından fazlası gelir.
    const mature = data.content.filter((c) => c.owner.id === "oa_1" && age(c.publishedAt) > 30);
    expect(mature.length).toBeGreaterThan(10);
    for (const c of mature) {
      const early = data.snapshots.filter((x) => x.contentItemId === c.id && age(c.publishedAt) - age(x.capturedAt) <= 3.6);
      expect(early.at(-1)?.views ?? 0, c.id).toBeGreaterThan((c.metrics.views as number) / 2);
    }
  });

  it("hesap takipçi snapshot'ları: kendi hesaplar günlük (birkaç gün ölçülemedi), son değer = hesap takipçisi", () => {
    for (const a of data.ownAccounts) {
      const snaps = data.accountSnapshots.filter((s) => s.subjectId === a.id);
      expect(snaps.length).toBeGreaterThan(80);
      expect(snaps.length).toBeLessThan(90);
      expect(snaps.at(-1)?.followers).toBe(a.followers);
    }
    expect(data.accountSnapshots.some((s) => s.subjectKind === "competitor")).toBe(true);
  });
});

describe("mock veri: transcript + analiz", () => {
  it("40 transcript + analiz; hook transcript'in başı, alıntılar birebir, evidenceVerified gerçek kontrol", () => {
    expect(data.transcripts).toHaveLength(40);
    expect(data.analyses).toHaveLength(40);
    for (const a of data.analyses) {
      const t = data.transcripts.find((x) => x.contentItemId === a.contentItemId);
      const text = t?.text ?? "";
      expect(t?.isMeaningful, a.id).toBe((t?.wordCount ?? 0) >= 8);
      if (a.status !== "ok") {
        expect(a.evidenceVerified).toBe(false);
        expect(a.failureReason).toBeTruthy();
        continue;
      }
      expect(text.startsWith(a.hookText ?? "∅"), a.id).toBe(true);
      expect(a.hookText?.includes(a.hookTypeEvidence ?? "∅")).toBe(true);
      const quotes = [a.hookText, a.hookTypeEvidence, ...a.sections.map((s) => s.quote), ...a.labels.map((l) => l.evidence)];
      expect(a.evidenceVerified, a.id).toBe(quotes.every((q) => q !== undefined && text.includes(q)));
      expect(a.sections.some((s) => s.type === "hook" && s.startSec === 0)).toBe(true);
    }
    const statuses = data.analyses.map((a) => a.status);
    expect(statuses.filter((s) => s === "ok").length).toBeGreaterThanOrEqual(30);
    expect(statuses).toContain("insufficient_data");
    expect(statuses).toContain("failed");
    expect(data.analyses.some((a) => a.status === "ok" && !a.evidenceVerified)).toBe(true);
    expect(new Set(data.analyses.map((a) => a.hookType).filter(Boolean)).size).toBeGreaterThanOrEqual(5);
    expect(data.transcripts.find((t) => t.contentItemId === "ci_001")).toBeDefined();
    const items = new Map(data.content.map((c) => [c.id, c]));
    for (const a of data.analyses) expect(items.get(a.contentItemId)?.analysisStatus).toBe(a.status);
  });
});

describe("mock veri: fikir, yayın, koşu", () => {
  it("15 fikir, her durumdan; ≥2 rakip kanıtı + liftAtCreation, 3–5 hook, script taslağı", () => {
    expect(data.ideas).toHaveLength(15);
    expect(new Set(data.ideas.map((i) => i.status))).toEqual(new Set(IDEA_STATUSES));
    const items = new Map(data.content.map((c) => [c.id, c]));
    for (const idea of data.ideas) {
      expect(idea.evidence.length).toBeGreaterThanOrEqual(2);
      for (const e of idea.evidence) {
        expect(items.get(e.contentItemId)?.owner.kind).toBe("competitor");
        expect(e.liftAtCreation).toBeGreaterThan(0);
      }
      expect(idea.hooks.length >= 3 && idea.hooks.length <= 5).toBe(true);
      expect(idea.hookType, idea.id).toBeTruthy();
      expect(idea.scriptOutline.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("10 yayın işi, her durumdan bir; approved ve sonrası approvedAt dolu; planlanan fikirler bağlı", () => {
    expect(data.publishJobs).toHaveLength(10);
    expect(data.publishJobs.map((j) => j.status).sort()).toEqual([...PUBLISH_STATUSES].sort());
    const unapproved = ["draft", "awaiting_approval", "cancelled"];
    for (const j of data.publishJobs) expect(j.approvedAt === undefined, j.status).toBe(unapproved.includes(j.status));
    for (const j of data.publishJobs) {
      const attempted = ["container_pending", "ready", "publishing", "published", "failed", "expired"].includes(j.status);
      expect(j.attemptCount > 0, j.status).toBe(attempted);
    }
    expect(data.publishJobs.find((j) => j.status === "failed")?.attemptCount).toBeGreaterThan(1);
    const published = data.publishJobs.find((j) => j.status === "published");
    expect(data.content.some((c) => c.owner.kind === "own" && c.externalId === published?.externalId)).toBe(true);
    for (const idea of data.ideas.filter((i) => i.status === "scheduled")) expect(idea.publishJobId).toBeDefined();
  });

  it("34 koşu (30 ücretli + 4 abonelik): apify çoğunluk + anthropic; kenar durumlar; eylül Apify harcaması $3–6 (tavan $10)", async () => {
    const runs = data.runs;
    expect(runs).toHaveLength(34);
    expect(runs.filter((r) => r.billing === "metered")).toHaveLength(30);
    // Abonelik koşuları: tutar yok (actualUsd undefined, 0 değil), rezerve 0; mutabakat sayacına girmez.
    const subscription = runs.filter((r) => r.billing === "subscription");
    expect(subscription).toHaveLength(4);
    expect(subscription.every((r) => r.actualUsd === undefined && r.reservedUsd === 0 && (r.provider === "gemini" || r.provider === "claude_cli"))).toBe(true);
    expect(runs.filter((r) => r.provider === "apify").length).toBeGreaterThan(15);
    expect(runs.filter((r) => r.provider === "anthropic").length).toBeGreaterThanOrEqual(2);
    for (const s of ["failed", "timed_out", "running", "ingested"]) expect(runs.some((r) => r.status === s), s).toBe(true);
    expect(runs.some((r) => r.priceUnknown)).toBe(true);
    expect(runs.some((r) => r.billing === "metered" && r.actualUsd === undefined && r.status === "ingested")).toBe(false);
    expect(runs.some((r) => r.actualUsd === undefined && (r.status === "succeeded" || r.status === "timed_out"))).toBe(true);
    expect(runs.some((r) => r.actualUsd === 0)).toBe(true); // mutabık ve gerçekten 0 (404 → ücret yok)
    const cost = await createMockRepository().getCostSummary(WS);
    expect(cost.month).toBe("2026-09");
    expect(cost.apify.committedUsd).toBeGreaterThanOrEqual(3);
    expect(cost.apify.committedUsd).toBeLessThanOrEqual(6);
    // Abonelik ayrı sayılır ve LLM kovasına/mutabakat sayacına karışmaz.
    expect(cost.subscription).toMatchObject({ runs: 4, byProvider: { gemini: 2, claude_cli: 2 } });
    // Gölge maliyet: 3 koşunun token'ı kayıtlı (fiyatlanır), kota hatasıyla düşen video koşusunun yok (fiyatlanamaz, 0 sayılmaz).
    expect(cost.subscription.shadow).toMatchObject({ pricedRuns: 3, unpricedRuns: 1 });
    expect(cost.subscription.shadow.usd).toBeCloseTo(0.795, 2);
    expect(cost.llm.runs).toBe(runs.filter((r) => r.billing === "metered" && r.provider !== "apify" && r.startedAt.startsWith("2026-09")).length);
  });

  it("listUnmeasured: bağlı olmayan hesap, gizli/bulunamayan rakip, içerik alanları, başarısız ve fiyatsız koşu", async () => {
    const entries = await createMockRepository().listUnmeasured(WS);
    expect(new Set(entries.map((e) => e.scope))).toEqual(new Set(["account", "competitor", "content", "source"]));
    expect(entries.some((e) => e.scope === "account" && e.refId === "oa_2")).toBe(true);
    expect(entries.some((e) => e.source === "collection_runs.price_unknown")).toBe(true);
    expect(entries.some((e) => e.scope === "content" && e.field === "saves")).toBe(true);
    expect(entries.length).toBeLessThan(150); // içerik satırları hesap+alan başına gruplanır
  });
});

describe("mock: determinizm", () => {
  const snapshot = (seed?: number) =>
    JSON.stringify(buildMockDataset(createClock(), seed), (_key, value: unknown) =>
      value instanceof Map ? [...value.entries()] : value,
    );

  it("aynı tohum → birebir aynı veri; farklı tohum → farklı veri", () => {
    expect(snapshot()).toBe(snapshot());
    expect(snapshot(7)).toBe(snapshot(7));
    expect(snapshot(7)).not.toBe(snapshot());
  });

  it("farklı tohumlarda da hedefler tutar (≥10 rakip lift ≥ 3, 300 içerik)", () => {
    for (const seed of [1, 2, 3, 42]) {
      const d = buildMockDataset(createClock(), seed);
      expect(d.content.filter((c) => c.owner.kind === "competitor" && (c.score.lift ?? 0) >= 3).length, `tohum ${seed}`).toBeGreaterThanOrEqual(10);
      expect(d.content).toHaveLength(300);
    }
  });

  it("Math.random kullanılmaz", () => {
    const spy = vi.spyOn(Math, "random");
    buildMockDataset(createClock(), 99);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("mock: genel bakış etkileşim oranı", () => {
  it("KPI = son 30 gündeki kendi içeriklerin medyan (beğeni + yorum) / takipçi oranı; eksik alanlı içerik hariç", async () => {
    // MOCK_NOW = 30 Eyl 09:00 UTC; İstanbul'da bugün 00:00 = 29 Eyl 21:00 UTC; pencere bugün dahil 30 gün.
    const windowStart = new Date("2026-09-29T21:00:00Z").getTime() - 29 * DAY_MS;
    const rates = data.content
      .filter((c) => c.owner.kind === "own" && new Date(c.publishedAt ?? 0).getTime() >= windowStart)
      .filter((c) => c.metrics.likes !== undefined && c.metrics.comments !== undefined && (c.owner.followers ?? 0) > 0)
      .map((c) => ((c.metrics.likes as number) + (c.metrics.comments as number)) / (c.owner.followers as number))
      .sort((a, b) => a - b);
    expect(rates.length).toBeGreaterThan(5);
    const mid = Math.floor(rates.length / 2);
    const expected = rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;

    const overview = await createMockRepository().getOverview(WS);
    const kpi = overview.kpis.find((k) => k.key === "engagement_rate");
    expect(kpi?.label).toBe("Medyan etkileşim oranı (takipçiye göre)");
    expect(kpi?.value).toBeCloseTo(expected, 10);
    // Günlük serinin son noktası da aynı tanım ve aynı pencere: KPI ile aynı değer.
    const series = overview.trends.find((t) => t.key === "engagement_rate");
    expect(series?.points.at(-1)?.value).toBeCloseTo(expected, 10);
  });
});

describe("mock: mutasyonlar", () => {
  it("aylık Apify tavanı aşılırsa addCompetitor budget_exceeded", async () => {
    const repo = createMockRepository();
    let last: unknown;
    for (let i = 0; i < 1000 && !(last instanceof RepositoryError); i++) {
      last = await repo.addCompetitor(WS, { platform: "instagram", handle: `tavan${i}` }).catch((e: unknown) => e);
    }
    expect(last).toMatchObject({ code: "budget_exceeded" });
    const cost = await repo.getCostSummary(WS);
    expect(cost.apify.committedUsd).toBeLessThanOrEqual(10);
  });

  it("bağlı olmayan hesaba yayın işi açılamaz; gizli rakip yalnız yoksayılabilir", async () => {
    const repo = createMockRepository();
    await expectCode(repo.createPublishJob(WS, { socialAccountId: "oa_2" }), "invalid_state");
    const hidden = data.competitors.find((c) => c.status === "private");
    await expectCode(repo.setCompetitorStatus(WS, hidden?.id ?? "", "candidate"), "invalid_state");
    expect((await repo.setCompetitorStatus(WS, hidden?.id ?? "", "ignored")).status).toBe("ignored");
  });

  it("aynı fikir durumu tekrar verilirse değişmeden döner; bilinmeyen durum invalid_input", async () => {
    const repo = createMockRepository();
    const [idea] = await repo.listIdeas(WS);
    expect((await repo.updateIdeaStatus(WS, idea.id, idea.status)).updatedAt).toBe(idea.updatedAt);
    await expectCode(repo.updateIdeaStatus(WS, idea.id, "yok" as never), "invalid_input");
  });
});
