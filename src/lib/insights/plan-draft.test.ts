/**
 * docs/FAZ2-PLAN.md §1 bulgularını yeniden üreten sabit veri setiyle uçtan uca testler: `buildInsights` (karşılaştırma) ve
 * `buildPlanDraft` (plan taslağı) aynı verinin içinden AYNI bulguları çıkarmalı.
 */
import { describe, expect, it } from "vitest";

import { WEEKLY_PLAN_SECTIONS_SCHEMA } from "@/lib/data/weekly-plan-schema";
import { buildInsights } from "@/lib/data/views/insights";
import { postingHours } from "@/lib/data/views/insights-posting";
import { buildPlanDraft } from "@/lib/insights/plan-draft";
import {
  CURRENT_WEEK,
  FIXTURE_COMPETITORS,
  FIXTURE_NOW,
  FIXTURE_OFF_NICHE,
  FIXTURE_OWN,
  FIXTURE_WORKSPACE,
  NEXT_WEEK,
  fixtureItems,
} from "@/lib/insights/testing/faz2-fixture";
import type { PlanDraftInput } from "@/lib/insights/types";

const input = (over: Partial<PlanDraftInput> = {}): PlanDraftInput => ({
  weekStart: NEXT_WEEK,
  now: FIXTURE_NOW,
  workspace: FIXTURE_WORKSPACE,
  own: FIXTURE_OWN,
  competitors: FIXTURE_COMPETITORS,
  items: fixtureItems,
  offNicheContentIds: [...FIXTURE_OFF_NICHE],
  // evelyn: elenen 3 videonun 2'si niş dışı (%67 ≥ %60) → hesap düzeyinde "kaçın".
  screenedContentIds: [...FIXTURE_OFF_NICHE, "ev1"],
  ...over,
});

const insights = buildInsights({ workspace: FIXTURE_WORKSPACE, own: FIXTURE_OWN, competitors: FIXTURE_COMPETITORS, items: fixtureItems, now: FIXTURE_NOW, offNicheContentIds: [...FIXTURE_OFF_NICHE] });
const row = (handle: string) => insights.rows.find((r) => r.handle === handle);
const draft = buildPlanDraft(input());
const { winners, focus, schedule, avoid } = draft.sections;

describe("sabit veri seti: FAZ2-PLAN §1 bulguları (buildInsights)", () => {
  it("1 · süre: Ornek'in 10 videosu 10–25 sn (ort. 14,3), rakip tutanları 56/92/108/128 sn", () => {
    const own = fixtureItems.filter((c) => c.owner.kind === "own").map((c) => c.durationSec ?? 0);
    expect([own.length, Math.min(...own), Math.max(...own)]).toEqual([10, 10, 25]);
    expect(own.reduce((a, b) => a + b, 0) / own.length).toBeCloseTo(14.3, 9);
    expect(winners.rivals.map((w) => w.durationSec).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([56, 92, 108, 128]);
    // Kovalar: rakiplerde ≥90 sn tutanlı ve baz çizgisinin üstünde; <30 sn düşük ve 0 tutan; Ornek yalnız ≤30 sn'de.
    const over90 = insights.durationBuckets.competitors.find((g) => g.key === "over_90");
    const short = insights.durationBuckets.competitors.find((g) => g.key === "15_30");
    expect(over90?.medianLift).toBeGreaterThan(1.1);
    expect(over90?.outlierCount).toBe(3);
    expect(short?.medianLift).toBeLessThan(0.6);
    expect(short?.outlierCount).toBe(0);
    expect(insights.durationBuckets.own.map((g) => g.key)).toEqual(["under_15", "15_30"]);
  });

  it("2 · CTA: yorum-anahtar-kelime payı noelle 8/10, align 3/10, Ornek 0/10", () => {
    expect(row("noelle")?.commentCtaShare).toBeCloseTo(0.8, 9);
    expect(row("align")?.commentCtaShare).toBeCloseTo(0.3, 9);
    expect(row("ornekhesap")?.commentCtaShare).toBe(0);
    const cta = insights.ctaTypes.competitors.find((g) => g.key === "comment_keyword");
    expect(cta).toMatchObject({ n: 11, outlierCount: 3 });
    expect(insights.ctaTypes.own.map((g) => g.key)).toEqual(["none"]);
  });

  it("3 · sıklık: Ornek ≈7 günde bir, son paylaşım 19 gün önce; rakipler 0,4–1,6 günde bir", () => {
    const ornek = row("ornekhesap")?.posting;
    expect(ornek?.medianGapDays).toBeGreaterThanOrEqual(6.5);
    expect(ornek?.medianGapDays).toBeLessThanOrEqual(7.5);
    expect(ornek?.daysSinceLastPost).toBe(19);
    for (const handle of ["noelle", "align"]) expect(row(handle)?.posting.medianGapDays).toBeLessThanOrEqual(1.6);
  });

  it("3 · saat: noelle videolarının 10/10'u 07:00 ET (gün×saat dilimleri bunu göstermez, saat profili gösterir); İstanbul'da 14:00", () => {
    const noelle = fixtureItems.filter((c) => c.owner.handle === "noelle");
    expect(postingHours(noelle, "America/New_York")[0]).toMatchObject({ hour: 7, n: 10, share: 1 });
    expect(postingHours(noelle, "Europe/Istanbul")[0]).toMatchObject({ hour: 14, n: 10 });
    expect(row("noelle")?.posting.topSlotShare).toBeLessThan(0.5);
  });

  it("4 · erişim: medyan izlenme ÷ takipçi Ornek 0,69; rakipler 0,06–0,09", () => {
    expect(row("ornekhesap")?.medianViewsPerFollower).toBeCloseTo(0.69, 2);
    for (const handle of ["noelle", "align", "evelyn"]) {
      const ratio = row(handle)?.medianViewsPerFollower ?? 0;
      expect(ratio).toBeGreaterThanOrEqual(0.06);
      expect(ratio).toBeLessThanOrEqual(0.09);
    }
  });

  it("5 · hashtag: noelle #renewyourmind 9/10 (imza seri); Ornek'in 50 etiketinin 47'si tekil", () => {
    expect(row("noelle")?.hashtags).toMatchObject({ topTag: "renewyourmind", topTagVideos: 9 });
    expect(row("noelle")?.hashtags.topTagShare).toBeCloseTo(0.9, 9);
    const ornek = fixtureItems.filter((c) => c.owner.kind === "own").flatMap((c) => c.hashtags);
    expect([ornek.length, new Set(ornek).size]).toEqual([50, 47]);
    expect(row("ornekhesap")?.hashtags.topTagShare).toBeLessThanOrEqual(0.2);
  });

  it("6 · veri kalitesi: evelyn 8/10 beğeni gizli, 7/10 video <3 gün, 2 niş dışı; benzer boy havuzu boş", () => {
    const badges = Object.fromEntries((row("evelyn")?.quality ?? []).map((b) => [b.kind, [b.count, b.total]]));
    expect(badges).toEqual({ hidden_likes: [8, 10], too_young: [7, 10], off_niche: [2, 10] });
    expect(insights.similarSize).toEqual({ ownFollowers: 1_450, count: 0, handles: [] });
    // Olgun video sayısı 3: baz çizgisi yalnız 2–3 videodan (n=2–3).
    const evelyn = fixtureItems.filter((c) => c.owner.handle === "evelyn");
    expect(evelyn.filter((c) => !c.score.immature)).toHaveLength(3);
    expect(Math.max(...evelyn.map((c) => c.score.baselineN ?? 0))).toBe(3);
  });
});

describe("sabit veri seti: plan taslağı bölümleri", () => {
  it("şema: sections WEEKLY_PLAN_SECTIONS_SCHEMA ile geçerli (JSON gidiş-dönüşünden sonra da)", () => {
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(draft.sections).success).toBe(true);
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(JSON.parse(JSON.stringify(draft.sections))).success).toBe(true);
  });

  it("ne tuttu: rakip ≥3x dört video (eşik gevşemedi), kendi tutanı yalnız ≥1,5x; niş dışı yüksek liftli video yok", () => {
    expect(winners.rivals.map((w) => w.contentItemId)).toEqual(["al1", "al2", "no1", "no3"]);
    expect(winners.relaxedThreshold).toBe(false);
    expect(winners.rivals.every((w) => w.lift >= 3 && !w.isOwn)).toBe(true);
    expect(winners.own.map((w) => w.contentItemId)).toEqual(["ay9"]);
    expect(winners.own[0].lift).toBeGreaterThanOrEqual(1.5);
    // ev9 olgun ve ≥3x ama niş dışı: tutan değil.
    expect(winners.rivals.map((w) => w.contentItemId)).not.toContain("ev9");
    expect(winners.unmeasuredReason).toBeUndefined();
    expect(winners.rivals.every((w) => !w.analyzed && w.why === undefined && w.quote === undefined)).toBe(true);
  });

  it("neye yüklen: uzun format (≥90 sn) yenilik puanı alır; ikinci yön yorum-anahtar-kelime CTA'sı", () => {
    expect(focus.directions.map((d) => [d.group, d.value])).toEqual([["duration_bucket", "over_90"], ["cta_type", "comment_keyword"]]);
    const [long, cta] = focus.directions;
    // 11 ölçülmüş video örnek olarak "yüksek" olurdu; ama rakiplerin her videosu 10'dan az içeriğe dayanan baz çizgisinde
    // (hesap başına 10 Reels → lowConfidence): güven tavanı orta (`capConfidenceForBaseline`).
    expect(long).toMatchObject({ ownTried: false, novelty: 1.5, sampleSize: 11, confidence: "medium" });
    // Puan = büzülmüş etki × yenilik; gösterilen etki ham kalır (n=11 → 1 + (etki − 1)·11/16).
    expect(long.score).toBeCloseTo((1 + ((long.impact ?? 0) - 1) * (11 / 16)) * 1.5, 9);
    expect(cta).toMatchObject({ ownTried: false, novelty: 1.5 });
    expect(focus.directions.every((d) => (d.impact ?? 0) > 1 && d.evidenceContentIds.length >= 2)).toBe(true);
    expect(focus.directions[0].score).toBeGreaterThanOrEqual(focus.directions[1].score);
    // 30–60 sn kovası tek başına baz çizgisinin üstünde değil: yön değil.
    expect(focus.directions.map((d) => d.value)).not.toContain("30_60");
  });

  it("kaçın: rakiplerde 15–30 sn (medyan ≈0,5x, 0 tutan) ve CTA'sız içerik; niş dışı evelyn ayrı kayıt", () => {
    const short = avoid.entries.find((e) => e.group === "duration_bucket");
    expect(short).toMatchObject({ kind: "low_lift", value: "15_30", sampleSize: 8, confidence: "medium" });
    expect(short?.medianLift).toBeLessThan(0.6);
    expect(avoid.entries.find((e) => e.group === "cta_type")).toMatchObject({ value: "none" });
    const off = avoid.entries.find((e) => e.kind === "off_niche");
    expect(off).toMatchObject({ value: "evelyn", sampleSize: 2, confidence: "low" });
    expect(avoid.entries.every((e) => e.kind === "off_niche" || (e.medianLift ?? 9) < 1)).toBe(true);
  });

  it("takvim: Ornek 6,9 günde bir yazarken adet ≥3 (rakip medyan haftalık ≈6,4 → 3); ET diliminde, Ornek'in iyi saati + noelle 07 ET", () => {
    expect(schedule.audienceTimeZone).toBe("America/New_York");
    expect(schedule.postsPerWeek).toBeGreaterThanOrEqual(3);
    expect(schedule.postsPerWeek).toBeLessThanOrEqual(5);
    expect(schedule.rivalMedianPostsPerWeek).toBeGreaterThan(row("ornekhesap")?.posting.postsPerWeek ?? 99);
    expect(schedule.slots).toHaveLength(schedule.postsPerWeek);
    expect(schedule.slots.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(new Set(schedule.slots.map((s) => s.basis))).toEqual(new Set(["own_good", "rival_fixed"]));
    const fixed = schedule.slots.find((s) => s.basis === "rival_fixed");
    // Çarşamba 2026-10-07 07:00 EDT (UTC−4) = 11:00Z; hafta günü Çarşamba (2).
    expect(fixed).toMatchObject({ at: "2026-10-07T11:00:00.000Z", weekday: 2, hour: 7 });
    expect(fixed?.note).toContain("@noelle");
    expect(schedule.slots.every((s) => new Date(s.at) > FIXTURE_NOW)).toBe(true);
  });

  it("geçen hafta: yayın verisi bekleniyor (F3'e kadar)", () => {
    expect(draft.sections.review.status).toBe("awaiting_publish_data");
  });

  it("adaylar: ≥3 aday, her biri ≥2 farklı kanıt ve ≥1 rakip tutanı; plana 3–5 tanesi, slot sırasıyla", () => {
    expect(draft.candidates.length).toBeGreaterThanOrEqual(3);
    for (const c of draft.candidates) {
      expect(new Set(c.evidenceContentIds).size).toBe(c.evidenceContentIds.length);
      expect(c.evidenceContentIds.length).toBeGreaterThanOrEqual(2);
      expect(c.rivalWinnerIds.length).toBeGreaterThanOrEqual(1);
      expect(c.evidenceContentIds).toEqual(expect.arrayContaining(c.rivalWinnerIds));
      expect(c.evidenceContentIds).not.toContain("ev9");
    }
    expect(draft.candidates.map((c) => c.rankScore)).toEqual([...draft.candidates.map((c) => c.rankScore)].sort((a, b) => b - a));
    expect(draft.plannedCandidateIds.length).toBeGreaterThanOrEqual(3);
    expect(draft.plannedCandidateIds.length).toBeLessThanOrEqual(5);
    expect(draft.plannedCandidateIds).toEqual(draft.candidates.slice(0, draft.plannedCandidateIds.length).map((c) => c.id));
    expect(new Set(draft.candidates.map((c) => c.seedContentItemId)).size).toBe(draft.candidates.length);
  });

  it("veri özeti: niş dışı 2 video elendi, analiz yok", () => {
    expect(draft.stats).toEqual({ rivalVideos: 28, ownVideos: 10, offNicheVideos: 2, analyzedRivals: 0, analyzedOwn: 0 });
  });

  it("analiz yokken hook grubu yok; analiz gelince hook türü yönü ve tutan çözümlemesi çıkar", () => {
    expect(focus.directions.some((d) => d.group === "hook_type")).toBe(false);
    const analyses = fixtureItems.map((c) => ({
      contentItemId: c.id,
      status: "ok" as const,
      evidenceVerified: true,
      hookType: c.owner.kind === "own" ? "story_open" : (c.score.lift ?? 0) >= 1.2 ? "bold_claim" : "question",
    }));
    const withAnalysis = buildPlanDraft(input({ analyses }));
    const hook = withAnalysis.sections.focus.directions.find((d) => d.group === "hook_type");
    expect(hook).toMatchObject({ value: "bold_claim", ownTried: false, novelty: 1.5 });
    expect(withAnalysis.sections.winners.rivals.every((w) => w.analyzed && w.hookType === "bold_claim")).toBe(true);
    expect(withAnalysis.stats.analyzedOwn).toBe(10);
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(withAnalysis.sections).success).toBe(true);
    // Doğrulanmamış analiz yön üretmez.
    const unverified = buildPlanDraft(input({ analyses: analyses.map((a) => ({ ...a, evidenceVerified: false })) }));
    expect(unverified.sections.focus.directions.some((d) => d.group === "hook_type")).toBe(false);
  });

  it("deterministik: girdi sırası değişse de çıktı aynı", () => {
    expect(buildPlanDraft(input({ items: [...fixtureItems].reverse() }))).toEqual(draft);
  });
});

describe("sabit veri seti: hafta ve saat dilimi", () => {
  it("şimdiki hafta (Çarşamba 08:00 ET): geçmiş slot önerilmez, Çarşamba 07:00 ET'lik slot sonraki güne kayar", () => {
    const current = buildPlanDraft(input({ weekStart: CURRENT_WEEK })).sections.schedule;
    expect(current.slots.length).toBeGreaterThan(0);
    expect(current.slots.every((s) => new Date(s.at) > FIXTURE_NOW && s.weekday >= 2)).toBe(true);
  });

  it("Pazartesi olmayan hafta başı haftasına hizalanır; geçersiz tarih hata verir", () => {
    expect(buildPlanDraft(input({ weekStart: "2026-10-07" })).weekStart).toBe("2026-10-05");
    expect(() => buildPlanDraft(input({ weekStart: "2026-02-31" }))).toThrow(RangeError);
    expect(() => buildPlanDraft(input({ weekStart: "yarin" }))).toThrow(RangeError);
  });

  it("tamamen geçmiş hafta: slot yok, sebep yazılır", () => {
    const past = buildPlanDraft(input({ weekStart: "2026-09-14" })).sections.schedule;
    expect(past.slots).toEqual([]);
    expect(past.unmeasuredReason).toMatch(/yetmiyor/);
  });

  it("DST: ET'de saat kayması doğru (Kasım'da EST, UTC−5): Çarşamba 07:00 = 12:00Z", () => {
    const week = buildPlanDraft(input({ weekStart: "2026-11-02", now: FIXTURE_NOW })).sections.schedule;
    expect(week.slots.find((s) => s.basis === "rival_fixed")?.at).toBe("2026-11-04T12:00:00.000Z");
  });

  it("hedef kitle saat dilimi yoksa çalışma alanı dilimi kullanılır (İstanbul): gün/saat ona göre", () => {
    const istanbul = buildPlanDraft(input({ workspace: { timezone: "Europe/Istanbul" } })).sections.schedule;
    expect(istanbul.audienceTimeZone).toBe("Europe/Istanbul");
    const fixed = istanbul.slots.find((s) => s.basis === "rival_fixed");
    // noelle 11:30Z'de yayınlar: İstanbul'da 14:30 → saat 14.
    expect(fixed?.hour).toBe(14);
  });
});
