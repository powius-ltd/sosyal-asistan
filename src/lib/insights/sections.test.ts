/**
 * Plan bölümlerinin kural testleri (küçük, elle kurulan senaryolar): ne tuttu, neye yüklen, kaçın, adaylar ve sınır durumları
 * (boş veri, n<5 düşük güven, ölçülemeyen lift, olgunlaşmamış içerik, niş dışı, izlenmeyen rakip).
 */
import { describe, expect, it } from "vitest";

import { WEEKLY_PLAN_SECTIONS_SCHEMA } from "@/lib/data/weekly-plan-schema";
import { buildPlanDraft } from "@/lib/insights/plan-draft";
import { CTA_CAPTION, planInput, rivalVideos, video } from "@/lib/insights/testing/builders";
import { FIXTURE_COMPETITORS, FIXTURE_OWN } from "@/lib/insights/testing/faz2-fixture";

const draftOf = (items: Parameters<typeof planInput>[0], over: Parameters<typeof planInput>[1] = {}) => buildPlanDraft(planInput(items, over));

describe("boş veri", () => {
  const empty = draftOf([], { own: [], competitors: [] });

  it("çökmez; bölümler şemaya uyar, boş liste yerine sebep yazar", () => {
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(empty.sections).success).toBe(true);
    expect(empty.sections.winners).toMatchObject({ rivals: [], own: [], relaxedThreshold: false });
    expect(empty.sections.winners.unmeasuredReason).toMatch(/rakip videosu yok/);
    expect(empty.sections.focus.directions).toEqual([]);
    expect(empty.sections.focus.unmeasuredReason).toBeTruthy();
    expect(empty.sections.avoid.entries).toEqual([]);
    expect(empty.candidates).toEqual([]);
    expect(empty.plannedCandidateIds).toEqual([]);
    expect(empty.confidence).toBe("low");
    expect(empty.stats).toEqual({ rivalVideos: 0, ownVideos: 0, offNicheVideos: 0, analyzedRivals: 0, analyzedOwn: 0 });
  });

  it("takvim yine üretilir: alt sınır adet (3), varsayılan saat, sebepler yazılı; rakip sıklığı 0 değil undefined", () => {
    const { schedule } = empty.sections;
    expect(schedule.postsPerWeek).toBe(3);
    expect(schedule.rivalMedianPostsPerWeek).toBeUndefined();
    expect(schedule.slots.map((s) => [s.weekday, s.hour, s.basis])).toEqual([[0, 19, "default"], [2, 19, "default"], [4, 19, "default"]]);
    expect(schedule.unmeasuredReason).toMatch(/Rakip paylaşım sıklığı ölçülemedi/);
    expect(schedule.unmeasuredReason).toMatch(/Saat verisi yok/);
  });
});

describe("ne tuttu", () => {
  it("rakip eşiği: ≥3 tane ≥3x varsa gevşemez; 2x–3x arası alınmaz", () => {
    const d = draftOf(rivalVideos("r", "noelle", 90, [3.1, 3.4, 3.8, 2.4]));
    expect(d.sections.winners.rivals.map((w) => w.lift)).toEqual([3.8, 3.4, 3.1]);
    expect(d.sections.winners.relaxedThreshold).toBe(false);
  });

  it("≥3x 3'ten azsa ≥2x'e gevşer ve işaretlenir; gevşeme işe yaramadıysa işaret yok", () => {
    const relaxed = draftOf(rivalVideos("r", "noelle", 90, [3.2, 2.4, 2.1, 1.0]));
    expect(relaxed.sections.winners.rivals.map((w) => w.lift)).toEqual([3.2, 2.4, 2.1]);
    expect(relaxed.sections.winners.relaxedThreshold).toBe(true);
    const none = draftOf(rivalVideos("r", "noelle", 90, [1.4, 1.0, 0.5]));
    expect(none.sections.winners.rivals).toEqual([]);
    expect(none.sections.winners.relaxedThreshold).toBe(false);
  });

  it("rakip en çok 5, kendi en çok 3; sıra lift azalan", () => {
    const rivals = rivalVideos("r", "noelle", 90, [3.1, 9, 4, 3.3, 5, 3.9, 6]);
    const own = [1.6, 2.5, 1.9, 4].map((lift, i) => video({ id: `o${i}`, owner: "ornek", lift, daysAgo: 10 + i }));
    const { winners } = draftOf([...rivals, ...own]).sections;
    expect(winners.rivals.map((w) => w.lift)).toEqual([9, 6, 5, 4, 3.9]);
    expect(winners.own.map((w) => w.lift)).toEqual([4, 2.5, 1.9]);
  });

  it("pencere: rakip son 30 gün, kendi son 90 gün", () => {
    const items = [
      video({ id: "r-in", owner: "noelle", lift: 4, daysAgo: 29 }),
      video({ id: "r-out", owner: "noelle", lift: 5, daysAgo: 31 }),
      video({ id: "o-in", owner: "ornek", lift: 2, daysAgo: 89 }),
      video({ id: "o-out", owner: "ornek", lift: 3, daysAgo: 91 }),
    ];
    const { winners } = draftOf(items).sections;
    expect(winners.rivals.map((w) => w.contentItemId)).toEqual(["r-in"]);
    expect(winners.own.map((w) => w.contentItemId)).toEqual(["o-in"]);
  });

  it("ölçülemeyen lift ve <3 günlük (olgunlaşmamış) içerik tutan sayılmaz; sebep yazılır", () => {
    const items = [video({ id: "a", owner: "noelle", lift: undefined }), video({ id: "b", owner: "noelle", lift: 9, immature: true, daysAgo: 1 })];
    const { winners } = draftOf(items).sections;
    expect(winners.rivals).toEqual([]);
    expect(winners.unmeasuredReason).toMatch(/ölçebildiğim rakip videosu yok/);
    expect(winners.unmeasuredReason).toMatch(/kendi videon yok/);
  });

  it("analiz `ok` ama kanıtı doğrulanamadıysa `evidenceUnverified`; doğrulanmışta `analyzed`; analiz hiç yoksa alan yok", () => {
    const analyses = [
      { contentItemId: "r1", status: "ok" as const, evidenceVerified: false, hookType: "question" },
      { contentItemId: "r2", status: "ok" as const, evidenceVerified: true, hookType: "bold_claim" },
      { contentItemId: "r3", status: "failed" as const, evidenceVerified: false },
    ];
    const { winners } = draftOf(rivalVideos("r", "noelle", 90, [3.4, 3.3, 3.2, 3.1]), { analyses }).sections;
    const byId = new Map(winners.rivals.map((w) => [w.contentItemId, w]));
    expect(byId.get("r1")).toMatchObject({ analyzed: false, evidenceUnverified: true, hookType: undefined });
    expect(byId.get("r2")).toMatchObject({ analyzed: true, hookType: "bold_claim" });
    expect(byId.get("r2")?.evidenceUnverified).toBeUndefined();
    expect(byId.get("r3")?.evidenceUnverified).toBeUndefined(); // başarısız analiz: doğrulanamadı değil, analiz yok
    expect(byId.get("r4")?.evidenceUnverified).toBeUndefined(); // analiz hiç yok: "henüz analiz edilmedi"
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse({ ...draftOf([]).sections, winners }).success).toBe(true);
  });

  it("izlenmeyen (ignored) rakip, başka kendi hesap ve kısa olmayan içerik hesaba girmez", () => {
    const ignored = FIXTURE_COMPETITORS.map((c) => (c.handle === "align" ? { ...c, status: "ignored" as const } : c));
    const items = [
      video({ id: "al", owner: "align", lift: 5 }),
      video({ id: "car", owner: "noelle", lift: 6, format: "carousel" }),
      video({ id: "ok", owner: "noelle", lift: 4 }),
      video({ id: "other", owner: "ornek", lift: 3 }),
    ];
    const d = draftOf(items, { competitors: ignored, own: [{ ...FIXTURE_OWN[0], id: "own-baska" }] });
    expect(d.sections.winners.rivals.map((w) => w.contentItemId)).toEqual(["ok"]);
    expect(d.sections.winners.own).toEqual([]);
    expect(d.stats).toMatchObject({ rivalVideos: 1, ownVideos: 0 });
  });

  it("gelecek tarihli, tarihsiz ve yinelenen içerik havuza girmez", () => {
    const future = video({ id: "f", owner: "noelle", lift: 5, daysAgo: -2 });
    const undated = { ...video({ id: "u", owner: "noelle", lift: 5 }), publishedAt: undefined };
    const a = video({ id: "dup", owner: "noelle", lift: 5 });
    const d = draftOf([future, undated, a, { ...a, score: { ...a.score, lift: 9 } }]);
    expect(d.sections.winners.rivals.map((w) => [w.contentItemId, w.lift])).toEqual([["dup", 5]]);
  });
});

describe("neye yüklen", () => {
  const long = (lifts: (number | undefined)[]) => rivalVideos("L", "noelle", 120, lifts);

  it("yenilik: kendi hesap o süreyi denediyse 1, denemediyse 1,5", () => {
    const tried = draftOf([...long([1.4, 1.6, 1.2]), video({ id: "mine", owner: "ornek", dur: 100, lift: 1 })]).sections.focus.directions[0];
    expect(tried).toMatchObject({ value: "over_90", ownTried: true, novelty: 1 });
    // Puan büzülmüş etkiden gelir (n=3, medyan 1,4 → 1 + 0,4·3/8); gösterilen etki ham 1,4 kalır.
    expect(tried.impact).toBeCloseTo(1.4, 9);
    expect(tried.score).toBeCloseTo(1 + 0.4 * (3 / 8), 9);
    const untried = draftOf([...long([1.4, 1.6, 1.2]), video({ id: "mine", owner: "ornek", dur: 12, lift: 1 })]).sections.focus.directions[0];
    expect(untried).toMatchObject({ value: "over_90", ownTried: false, novelty: 1.5 });
  });

  it("güven örneklemden: 3 düşük, 5 orta, 10 yüksek; lift'i ölçülemeyen video n'e girmez", () => {
    const at = (lifts: (number | undefined)[]) => draftOf(long(lifts)).sections.focus.directions[0];
    expect(at([1.4, 1.5, 1.6])).toMatchObject({ sampleSize: 3, confidence: "low" });
    expect(at([1.4, 1.5, 1.6, 1.7, 1.8])).toMatchObject({ sampleSize: 5, confidence: "medium" });
    expect(at(Array.from({ length: 10 }, () => 1.5))).toMatchObject({ sampleSize: 10, confidence: "high" });
    expect(at([1.4, 1.5, 1.6, undefined, undefined, undefined, undefined])).toMatchObject({ sampleSize: 3, confidence: "low" });
  });

  it("tek videolu, baz çizgisinin altındaki ya da tam 1,0x grup yön olmaz", () => {
    expect(draftOf(long([3])).sections.focus.directions).toEqual([]);
    expect(draftOf(long([0.8, 0.9, 1.0])).sections.focus.directions).toEqual([]);
    expect(draftOf(long([1, 1, 1])).sections.focus.directions).toEqual([]);
    expect(draftOf(long([undefined, undefined])).sections.focus.unmeasuredReason).toMatch(/ölçülemedi/);
  });

  it("çeşitlilik: eksen başına en iyi grup (iki süre kovası birden çıkmaz), puan sırasıyla", () => {
    const mixed = [...long([1.5, 1.6]), ...rivalVideos("C", "align", 50, [1.3, 1.4], CTA_CAPTION), ...rivalVideos("S", "evelyn", 20, [1.2, 1.25])];
    const { directions } = draftOf(mixed).sections.focus;
    // Süre: 3 kova da baz çizgisinin üstünde (120 sn 1,55 · 50 sn 1,35 · 20 sn 1,23) ama yalnız en iyisi; CTA ekseninden de bir yön.
    expect(directions.map((d) => [d.group, d.value])).toEqual([["duration_bucket", "over_90"], ["cta_type", "comment_keyword"]]);
    expect(directions.map((d) => d.score)).toEqual([...directions.map((d) => d.score)].sort((a, b) => b - a));
  });

  it("yalnız tek eksen yön verebiliyorsa 2 yöne tamamlanır, 3'e değil", () => {
    const captionless = [...long([1.5, 1.6]), ...rivalVideos("M", "align", 50, [1.3, 1.4]), ...rivalVideos("S", "evelyn", 20, [1.2, 1.25])];
    expect(draftOf(captionless).sections.focus.directions.map((d) => [d.group, d.value])).toEqual([["duration_bucket", "over_90"], ["duration_bucket", "30_60"]]);
  });

  it("en çok 3 yön: dört eksen de uygunsa en düşük puanlı eksen elenir", () => {
    const rivals = [...long([1.5, 1.6]), ...rivalVideos("C", "align", 50, [1.3, 1.4], CTA_CAPTION)];
    const analyses = rivals.map((c) => ({ contentItemId: c.id, status: "ok" as const, evidenceVerified: true, hookType: "question" }));
    const clusters = [{ id: "k", label: "Sabah", contentItemIds: rivals.map((c) => c.id) }];
    const { directions } = draftOf(rivals, { analyses, clusters }).sections.focus;
    expect(directions).toHaveLength(3);
    expect(new Set(directions.map((d) => d.group)).size).toBe(3);
  });

  it("hook ekseni: kendi videolar analizsizken atlanır (yenilik uydurulmaz); kendi video hiç yoksa karşılaştırılabilir", () => {
    const rivals = long([1.5, 1.6, 1.7]);
    const analyses = rivals.map((c) => ({ contentItemId: c.id, status: "ok" as const, evidenceVerified: true, hookType: "bold_claim" }));
    const hasHook = (d: ReturnType<typeof draftOf>) => d.sections.focus.directions.some((x) => x.group === "hook_type");
    expect(hasHook(draftOf([...rivals, video({ id: "mine", owner: "ornek", dur: 12, lift: 1 })], { analyses }))).toBe(false);
    expect(hasHook(draftOf(rivals, { analyses }))).toBe(true);
    const own = [{ contentItemId: "mine", status: "ok" as const, evidenceVerified: true, hookType: "question" }];
    const both = draftOf([...rivals, video({ id: "mine", owner: "ornek", dur: 12, lift: 1 })], { analyses: [...analyses, ...own] });
    expect(both.sections.focus.directions.find((x) => x.group === "hook_type")).toMatchObject({ value: "bold_claim", ownTried: false, novelty: 1.5 });
  });

  it("konu kümesi ekseni: küme adı değer olur", () => {
    const rivals = long([1.5, 1.6, 1.7]);
    const clusters = [{ id: "k1", label: "Sabah rutini", contentItemIds: rivals.map((c) => c.id) }];
    const direction = draftOf(rivals, { clusters }).sections.focus.directions.find((x) => x.group === "topic_cluster");
    expect(direction).toMatchObject({ value: "Sabah rutini", label: "Sabah rutini", ownTried: false });
  });
});

describe("kaçın", () => {
  const short = (prefix: string, lifts: (number | undefined)[]) => rivalVideos(prefix, "align", 20, lifts);

  it("n≥2 ve medyan lift <1 olan gruplar; tek videolu ya da ≥1 olan grup yok", () => {
    const d = draftOf([...short("a", [0.4, 0.5]), ...rivalVideos("b", "noelle", 50, [0.2]), ...rivalVideos("c", "evelyn", 100, [1.2, 1.3])]);
    expect(d.sections.avoid.entries.map((e) => [e.group, e.value, e.sampleSize])).toEqual([["duration_bucket", "15_30", 2]]);
    expect(d.sections.avoid.entries[0]).toMatchObject({ kind: "low_lift", confidence: "low" });
  });

  it("en düşükten başlar, en çok 3; yön olan grup kaçın listesinde olmaz", () => {
    const items = [
      ...rivalVideos("a", "align", 10, [0.3, 0.4]),
      ...rivalVideos("b", "align", 20, [0.5, 0.6]),
      ...rivalVideos("c", "align", 40, [0.7, 0.8]),
      ...rivalVideos("d", "align", 70, [0.85, 0.9]),
      ...rivalVideos("e", "align", 120, [1.5, 1.6]),
    ];
    const d = draftOf(items);
    expect(d.sections.avoid.entries.map((e) => e.value)).toEqual(["under_15", "15_30", "30_60"]);
    expect(d.sections.focus.directions.map((x) => x.value)).toEqual(["over_90"]);
  });

  it("niş dışı video: yön/tutan/aday hesabına girmez; tek video hesabı 'kaçın'a yazdırmaz (yalnız video düzeyinde)", () => {
    const viral = video({ id: "viral", owner: "evelyn", lift: 8, dur: 100 });
    const d = draftOf([...rivalVideos("n", "noelle", 100, [1.5, 1.6, 4]), viral], { offNicheContentIds: ["viral", "viral"], screenedContentIds: ["viral"] });
    expect(d.sections.winners.rivals.map((w) => w.contentItemId)).not.toContain("viral");
    expect(d.candidates.flatMap((c) => c.evidenceContentIds)).not.toContain("viral");
    expect(d.sections.avoid.entries.find((e) => e.kind === "off_niche")).toBeUndefined();
    expect(d.stats).toMatchObject({ offNicheVideos: 1, rivalVideos: 3 });
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(d.sections).success).toBe(true);
  });

  describe("hesap düzeyinde niş dışı: ≥ 3 elenmiş video ve ≥ %60 niş dışı", () => {
    const evelyn = rivalVideos("e", "evelyn", 60, [1.1, 1.2, 1.3, 1.4, 1.5]);
    const entry = (off: string[], screened: string[] | undefined) =>
      draftOf(evelyn, { offNicheContentIds: off, screenedContentIds: screened }).sections.avoid.entries.find((e) => e.kind === "off_niche");

    it("sınır: 5 elenmişin 3'ü (%60) hesabı yazdırır; gerekçe elenen sayısını söyler", () => {
      expect(entry(["e1", "e2", "e3"], ["e1", "e2", "e3", "e4", "e5"])).toMatchObject({ value: "evelyn", label: "@evelyn", sampleSize: 3 });
      expect(entry(["e1", "e2", "e3"], ["e1", "e2", "e3", "e4", "e5"])?.reason).toContain("5 videonun 3 tanesi");
    });

    it("%60'ın altı, 3'ten az elenmiş video ya da bilinmeyen payda: hesap yazılmaz", () => {
      expect(entry(["e1", "e2"], ["e1", "e2", "e3", "e4", "e5"])).toBeUndefined(); // %40
      expect(entry(["e1", "e2"], ["e1", "e2"])).toBeUndefined(); // %100 ama yalnız 2 elenmiş
      expect(entry(["e1", "e2", "e3"], undefined)).toBeUndefined(); // kaç video elendi bilinmiyor
    });
  });
});

describe("adaylar", () => {
  it("destekçisi olmayan tutan aday üretmez (≥2 kanıt kuralı)", () => {
    expect(draftOf(rivalVideos("r", "noelle", 120, [4])).candidates).toEqual([]);
  });

  it("kanıt = tohum + destekçiler (≥1,5x); tohum olmayan destekçi varken başka tohum eklenmez", () => {
    const items = rivalVideos("r", "noelle", 120, [5, 4, 1.6, 1.7, 1.1, 0.9]);
    const [first, second] = draftOf(items).candidates;
    expect(first.seedContentItemId).toBe("r1");
    expect(first.evidenceContentIds).toEqual(["r1", "r4", "r3"]);
    expect(first.rivalWinnerIds).toEqual(["r1"]);
    expect(second.evidenceContentIds).toEqual(["r2", "r4", "r3"]);
    expect(first.relaxedWinner).toBe(false);
  });

  it("destekçi yoksa son çare olarak başka bir tohum kanıta eklenir", () => {
    const { candidates } = draftOf(rivalVideos("r", "noelle", 120, [5, 4, 1.0, 1.1, 0.9]));
    expect(candidates.map((c) => c.evidenceContentIds)).toEqual([["r1", "r2"], ["r2", "r1"]]);
  });

  it("≥3x tutan azsa tohum ≥2x'e gevşer ve aday `relaxedWinner` olur", () => {
    const { candidates } = draftOf(rivalVideos("r", "noelle", 120, [2.5, 1.7, 1.6]));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ relaxedWinner: true, rivalWinnerIds: ["r1"] });
  });

  it("sıra = kanıt ortalama lift × yenilik; denenmiş yön yeniliği düşürür", () => {
    const rivals = [...rivalVideos("L", "noelle", 120, [4, 1.8, 1.7]), ...rivalVideos("S", "align", 50, [6, 2.6, 2.4])];
    const mine = video({ id: "mine", owner: "ornek", dur: 55, lift: 1 });
    const { candidates } = draftOf([...rivals, mine]);
    const byGroup = Object.fromEntries(candidates.map((c) => [c.value, c]));
    expect(byGroup.over_90).toMatchObject({ ownTried: false, novelty: 1.5 });
    expect(byGroup["30_60"]).toMatchObject({ ownTried: true, novelty: 1 });
    expect(byGroup.over_90.rankScore).toBeCloseTo(byGroup.over_90.evidenceMeanLift * 1.5, 9);
    expect(byGroup["30_60"].rankScore).toBeCloseTo(byGroup["30_60"].evidenceMeanLift, 9);
  });

  it("kendi tutan konularına uyum: kümelerle sıralama yükselir; küme yoksa uyum ölçülemez (undefined) ve ceza yok", () => {
    const rivals = [...rivalVideos("L", "noelle", 120, [4, 1.8]), ...rivalVideos("S", "align", 50, [4, 1.8])];
    const mine = video({ id: "mine", owner: "ornek", dur: 12, lift: 2 });
    const plain = draftOf([...rivals, mine]).candidates;
    expect(plain.map((c) => c.ownTopicMatch)).toEqual([undefined, undefined]);
    const clusters = [
      { id: "morning", label: "Sabah", contentItemIds: ["mine", "S1", "S2"] },
      { id: "other", label: "Diğer", contentItemIds: ["L1", "L2"] },
    ];
    const fitted = draftOf([...rivals, mine], { clusters }).candidates;
    const s = fitted.find((c) => c.seedContentItemId === "S1");
    const l = fitted.find((c) => c.seedContentItemId === "L1");
    expect(s?.ownTopicMatch).toBe(1);
    expect(l?.ownTopicMatch).toBe(0);
    expect(s?.rankScore).toBeCloseTo((s?.evidenceMeanLift ?? 0) * (s?.novelty ?? 0) * 1.25, 9);
    expect(l?.rankScore).toBeCloseTo((l?.evidenceMeanLift ?? 0) * (l?.novelty ?? 0), 9);
  });

  it("aday sayısı en çok 8; plana adet kadarı (3–5) alınır", () => {
    const many = Array.from({ length: 10 }, (_, i) => rivalVideos(`g${i}`, "noelle", 120, [4 + i, 1.8]));
    const d = draftOf(many.flat());
    expect(d.candidates.length).toBeLessThanOrEqual(8);
    expect(d.plannedCandidateIds).toHaveLength(d.sections.schedule.postsPerWeek);
    expect(d.plannedCandidateIds.length).toBeGreaterThanOrEqual(3);
  });
});
