/**
 * Takvim kuralları: adet (clamp), saat dayanağı (kendi en iyi → kendi iyi + rakip sabit → varsayılan), gün yayılımı,
 * geçmiş slotun kayması. Saatler HEDEF KİTLE diliminde (ET, Eylül/Ekim EDT = UTC−4) yorumlanır.
 */
import { describe, expect, it } from "vitest";

import { buildPlanDraft } from "@/lib/insights/plan-draft";
import { CURRENT_WEEK, FIXTURE_NOW } from "@/lib/insights/testing/faz2-fixture";
import { DAY, planInput, video, type OwnerKey } from "@/lib/insights/testing/builders";

const HOUR = 3_600_000;
/** ET saatinden UTC ISO (EDT, UTC−4): `et("2026-09-29", 19)` = 2026-09-29 19:00 ET. */
const et = (day: string, hour: number, minute = 0) => new Date(Date.parse(`${day}T00:00:00.000Z`) + (hour + 4) * HOUR + minute * 60_000).toISOString();

/** `count` video, `stepHours` saat arayla, en yenisi `startDaysAgo` gün önce. */
const cadence = (owner: OwnerKey, prefix: string, count: number, stepHours: number, extra: { lift?: number } = {}) =>
  Array.from({ length: count }, (_, i) =>
    video({ id: `${prefix}${i}`, owner, lift: extra.lift ?? 1, publishedAt: new Date(FIXTURE_NOW.getTime() - 4 * DAY - i * stepHours * HOUR).toISOString() }),
  );

const schedule = (items: ReturnType<typeof video>[], over: Parameters<typeof planInput>[1] = {}) => buildPlanDraft(planInput(items, over)).sections.schedule;

describe("adet = clamp(rakip medyan haftalık / 2, 3, 5)", () => {
  it("rakip sıklığı ölçülemezse 3; <3 tarihli videosu olan rakip sayılmaz (0 değil, undefined)", () => {
    expect(schedule([]).postsPerWeek).toBe(3);
    const two = schedule(cadence("noelle", "n", 2, 24));
    expect(two.rivalMedianPostsPerWeek).toBeUndefined();
    expect(two.postsPerWeek).toBe(3);
  });

  it("günde bir paylaşan rakip (≈7,9/hafta) → 4; 12 saatte bir (≈16/hafta) → üst sınır 5", () => {
    const daily = schedule(cadence("noelle", "n", 9, 24));
    expect(daily.rivalMedianPostsPerWeek).toBeCloseTo(7.88, 2);
    expect(daily.postsPerWeek).toBe(4);
    expect(daily.slots).toHaveLength(4);
    expect(schedule(cadence("noelle", "n", 14, 12)).postsPerWeek).toBe(5);
  });

  it("birden çok rakipte medyan alınır", () => {
    const items = [...cadence("noelle", "n", 9, 24), ...cadence("align", "a", 9, 72), ...cadence("evelyn", "e", 9, 72)];
    expect(schedule(items).rivalMedianPostsPerWeek).toBeLessThan(3);
    expect(schedule(items).postsPerWeek).toBe(3);
  });
});

describe("saat dayanağı", () => {
  /** Salı 19:00 ET'de `count` paylaşım (aynı gün×saat dilimi). */
  const tuesdays = (count: number) =>
    ["2026-09-22", "2026-09-15", "2026-09-08", "2026-09-01", "2026-08-25"].slice(0, count).map((day, i) => video({ id: `own${i}`, owner: "ornek", views: 1_000 + i, lift: 1, publishedAt: et(day, 19) }));
  const tuesdayPosts = tuesdays(3);
  /** 3 günde bir yayınlayan rakip (≈2,8/hafta → adet 3); saat `hourOf(i)` ET. */
  const slow = (hourOf: (i: number) => number, count = 6) =>
    Array.from({ length: count }, (_, i) => video({ id: `n${i}`, owner: "noelle", lift: 1, publishedAt: et(`2026-09-${String(2 + 3 * i).padStart(2, "0")}`, hourOf(i), 30) }));
  const noelleFixed = slow(() => 7);

  it("kendi en iyi saati ≥5 videoya dayansa da slotların en çok %75'ini alır (3 slotta 2); kalanı rakip saatinden keşif", () => {
    const { slots, unmeasuredReason } = schedule([...tuesdays(5), ...noelleFixed]);
    expect(slots.map((s) => [s.hour, s.basis])).toEqual([[19, "own_best"], [19, "own_best"], [7, "rival_fixed"]]);
    expect(slots[0].note).toContain("paylaşımların en çok dörtte üçü");
    expect(slots[2].note).toMatch(/^Keşif \(rakip saati\): @noelle/);
    expect(unmeasuredReason).toBeUndefined();
  });

  it("4 slotta güvenilir en iyi saat 3 slot alır, 1 keşif (keşif sonda); en az 2 farklı saat", () => {
    // Günde bir yayınlayan rakip (adet 4) 07:30 ET'de sabit (≥5 video, hepsi aynı saat).
    const daily = Array.from({ length: 9 }, (_, i) => video({ id: `d${i}`, owner: "noelle", lift: 1, publishedAt: et(`2026-09-${String(20 + i).padStart(2, "0")}`, 7, 30) }));
    const { slots } = schedule([...tuesdays(5), ...daily]);
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => [s.hour, s.basis])).toEqual([[19, "own_best"], [19, "own_best"], [19, "own_best"], [7, "rival_fixed"]]);
    expect(new Set(slots.map((s) => s.hour)).size).toBeGreaterThanOrEqual(2);
  });

  it("5 slotta güvenilir en iyi saat 3 slot alır, 2 keşif dağılır", () => {
    const busy = Array.from({ length: 14 }, (_, i) => video({ id: `b${i}`, owner: "noelle", lift: 1, publishedAt: et(`2026-09-${String(1 + Math.floor(i / 2)).padStart(2, "0")}`, 7 + (i % 2) * 5, 30) }));
    const { slots } = schedule([...tuesdays(5), ...busy]);
    expect(slots).toHaveLength(5);
    expect(slots.filter((s) => s.basis === "own_best")).toHaveLength(3);
    expect(slots.filter((s) => s.basis !== "own_best")).toHaveLength(2);
  });

  it("güvenilir en iyi saat tek ve keşif verisi yoksa hepsi o saatte kalır; sebep notu yazılır", () => {
    const { slots, unmeasuredReason } = schedule(tuesdays(5));
    expect(slots.every((s) => s.basis === "own_best" && s.hour === 19)).toBe(true);
    expect(unmeasuredReason).toMatch(/Kendi en iyi saatin tek saat \(5 videoya dayanıyor\) ve çeşitlendirecek başka saat verisi yok/);
  });

  it("kendi en iyi saati az örneğe (<5) dayanıyorsa slotların en çok yarısı o saatte; kalanı rakip saatinden, not dayanağı söyler", () => {
    const { slots } = schedule([...tuesdayPosts, ...noelleFixed]);
    expect(slots.map((s) => [s.hour, s.basis])).toEqual([[19, "own_best"], [7, "rival_fixed"], [7, "rival_fixed"]]);
    expect(slots[0].note).toContain("Yalnız 3 videoya dayanıyor");
    expect(slots[1].note).toMatch(/^Keşif \(rakip saati\): @noelle/);
  });

  it("az örnekli kendi saati + rakibin sabit olmayan yaygın saatleri (commonHours): farklı saatlere dağılır", () => {
    // noelle 6 videoyu 07, 07, 09, 09, 11, 12 ET'de yayınlıyor: hiçbir saat %50 değil (sabit yok); 07 ve 09 iki kez (yaygın).
    const hours = [7, 7, 9, 9, 11, 12];
    const { slots, unmeasuredReason } = schedule([...tuesdayPosts, ...slow((i) => hours[i])]);
    expect(slots.map((s) => [s.hour, s.basis])).toEqual([[19, "own_best"], [7, "rival_common"], [9, "rival_common"]]);
    expect(unmeasuredReason).toBeUndefined();
  });

  it("az örnekli kendi saati ve çeşitlendirecek başka saat yoksa hepsi o saatte kalır, sebep yazılır", () => {
    const { slots, unmeasuredReason } = schedule(tuesdayPosts);
    expect(slots.every((s) => s.basis === "own_best" && s.hour === 19)).toBe(true);
    expect(unmeasuredReason).toMatch(/çeşitlendirecek başka saat verisi yok/);
  });

  it("2 paylaşım en iyi saat sayılmaz; kendi iyi saati (≥2 video, medyan lift ≥1) + rakip sabit saati birlikte, sırayla", () => {
    const own = tuesdayPosts.slice(0, 2);
    const { slots } = schedule([...own, ...noelleFixed]);
    expect(slots.map((s) => [s.hour, s.basis])).toEqual([[19, "own_good"], [7, "rival_fixed"], [19, "own_good"]]);
  });

  it("kendi iyi saati: medyan lift <1 olan saat iyi değil; tek videolu saat iyi değil", () => {
    const weak = tuesdayPosts.slice(0, 2).map((c) => ({ ...c, score: { ...c.score, lift: 0.6 } }));
    expect(schedule(weak).slots.every((s) => s.basis === "default")).toBe(true);
    expect(schedule(tuesdayPosts.slice(0, 1)).slots.every((s) => s.basis === "default")).toBe(true);
  });

  it("rakip sabit saati: ≥5 video ve ≥%50 aynı saatte; 4 videolu ya da dağınık rakip sabit sayılmaz", () => {
    expect(schedule(slow(() => 7, 4)).slots.every((s) => s.basis === "default")).toBe(true);
    expect(schedule(slow((i) => 6 + i)).slots.every((s) => s.basis === "default")).toBe(true);
    expect(schedule(slow((i) => (i < 3 ? 9 : 10 + i))).slots.map((s) => [s.hour, s.basis])).toEqual([[9, "rival_fixed"], [9, "rival_fixed"], [9, "rival_fixed"]]);
  });

  it("hiç saat verisi yoksa varsayılan akşam saati ve not", () => {
    const { slots, unmeasuredReason } = schedule([]);
    expect(slots.every((s) => s.hour === 19 && s.basis === "default" && s.note?.includes("Yeterli saat verisi yok"))).toBe(true);
    expect(unmeasuredReason).toMatch(/Saat verisi yok/);
  });
});

describe("gün yayılımı ve zaman", () => {
  it("3 slot Pzt/Çar/Cum; 4 slot Pzt/Sal/Per/Cmt; 5 slot Pzt/Sal/Çar/Cum/Cmt; konum kronolojik 1..n", () => {
    const weekdays = (count: number) => schedule(cadence("noelle", "n", count === 3 ? 2 : count === 4 ? 9 : 14, count === 4 ? 24 : 12)).slots.map((s) => s.weekday);
    expect(weekdays(3)).toEqual([0, 2, 4]);
    expect(weekdays(4)).toEqual([0, 1, 3, 5]);
    expect(weekdays(5)).toEqual([0, 1, 2, 4, 5]);
    const { slots } = schedule(cadence("noelle", "n", 14, 12));
    expect(slots.map((s) => s.position)).toEqual([1, 2, 3, 4, 5]);
    expect([...slots].sort((a, b) => a.at.localeCompare(b.at))).toEqual(slots);
  });

  it("geçmiş slot önerilmez: Çarşamba 07:00 ET'lik slot (şimdi Çarşamba 08:00 ET) sonraki boş güne kayar", () => {
    // Rakip günde bir yayınlıyor (adet 4), hep 07:30 ET: Çarşamba 07:00 geçti → Cuma'dan sonraki boş gün (Pazar) alınır.
    const daily = Array.from({ length: 9 }, (_, i) => video({ id: `n${i}`, owner: "noelle", lift: 1, publishedAt: et(`2026-09-${String(20 + i).padStart(2, "0")}`, 7, 30) }));
    const { slots } = schedule(daily, { weekStart: CURRENT_WEEK });
    expect(slots.map((s) => [s.weekday, s.hour])).toEqual([[3, 7], [4, 7], [5, 7], [6, 7]]);
    expect(slots.every((s) => new Date(s.at) > FIXTURE_NOW)).toBe(true);
  });

  it("haftada yeterli gün kalmadıysa slot azalır ve sebep yazılır (adet öneri olarak kalır)", () => {
    const { slots, postsPerWeek, unmeasuredReason } = schedule([], { weekStart: CURRENT_WEEK, now: new Date("2026-10-04T12:00:00.000Z") });
    expect(postsPerWeek).toBe(3);
    expect(slots.length).toBeLessThan(3);
    expect(unmeasuredReason).toMatch(/Haftanın kalan günleri yetmiyor/);
  });

  it("`at` mutlak andır; weekday/hour hedef kitle dilimindedir (Pzt 20:00 ET = Salı 00:00Z)", () => {
    const { slots } = schedule([]);
    expect(slots[0]).toMatchObject({ weekday: 0, hour: 19, at: "2026-10-05T23:00:00.000Z" });
  });
});
