import { describe, expect, it } from "vitest";

import { plannedCount, rankIdeas, toPayloadIdeas } from "@/lib/intel/plan-payload";
import { isVoiceFresh } from "@/lib/intel/voice-step";
import type { WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import type { GeneratedIdea } from "@/lib/llm/generate-ideas-validate";

function idea(title: string, evidence: GeneratedIdea["evidence"], ownTried?: boolean): GeneratedIdea {
  return { title, rationale: "r", hooks: ["a", "b", "c"], hookType: "bold_claim", scriptOutline: ["s"], details: { ownTried }, evidence, relaxedOutlier: false, notes: [] };
}
const own = new Set(["mine"]);
const isOwn = (id: string) => own.has(id);

describe("rankIdeas", () => {
  it("puan = rakip kanıt ortalama lift × yenilik; kendi kanıt ortalamaya girmez; ölçülemeyen lift atlanır", () => {
    const a = idea("a", [{ contentItemId: "r1", liftAtCreation: 4 }, { contentItemId: "mine", liftAtCreation: 50 }], true); // 4 × 1
    const b = idea("b", [{ contentItemId: "r2", liftAtCreation: 3 }, { contentItemId: "r3", liftAtCreation: undefined }], false); // 3 × 1,5 = 4,5
    const ranked = rankIdeas([a, b], isOwn);
    expect(ranked.map((r) => r.idea.title)).toEqual(["b", "a"]);
    expect(ranked[0]).toMatchObject({ meanRivalLift: 3, novelty: 1.5, score: 4.5 });
  });

  it("hiç ölçülebilir rakip lift'i yoksa meanRivalLift undefined (0 değil), puan 0", () => {
    const [ranked] = rankIdeas([idea("x", [{ contentItemId: "r1", liftAtCreation: undefined }, { contentItemId: "mine" }])], isOwn);
    expect(ranked.meanRivalLift).toBeUndefined();
    expect(ranked.score).toBe(0);
  });
});

describe("plannedCount", () => {
  it("3–5 arası, eldeki fikirden fazla olmaz", () => {
    expect(plannedCount(2, 10)).toBe(3);
    expect(plannedCount(9, 10)).toBe(5);
    expect(plannedCount(4, 2)).toBe(2);
  });
});

describe("toPayloadIdeas", () => {
  const schedule: WeeklyPlanSections["schedule"] = {
    postsPerWeek: 3,
    audienceTimeZone: "America/New_York",
    slots: [
      { position: 1, at: "2026-10-05T11:00:00.000Z", weekday: 0, hour: 7, basis: "rival_fixed" },
      { position: 2, at: "2026-10-07T11:00:00.000Z", weekday: 2, hour: 7, basis: "own_good", note: "özel not" },
    ],
  };
  const ideas = ["a", "b", "c", "d", "e"].map((t, i) => idea(t, [{ contentItemId: `r${i}`, liftAtCreation: 5 - i }, { contentItemId: "mine" }], true));
  const payload = toPayloadIdeas(rankIdeas(ideas, isOwn), schedule);

  it("ilk N fikir plana girer (position 1..N), kalanı aday (position yok)", () => {
    expect(payload.map((p) => p.position)).toEqual([1, 2, 3, undefined, undefined]);
  });

  it("slot atanır; slot yoksa slot_at/slot_note yazılmaz; not yoksa dayanak etiketi", () => {
    expect(payload[0]).toMatchObject({ slot_at: "2026-10-05T11:00:00.000Z", slot_note: "Rakiplerin sabit saati" });
    expect(payload[1].slot_note).toBe("özel not");
    expect(payload[2].slot_at).toBeUndefined();
    expect(payload[3].slot_at).toBeUndefined();
  });

  it("kanıt lift'i ölçülemediyse lift_at_creation alanı YAZILMAZ (0 yazılmaz)", () => {
    expect(payload[0].evidence[1]).toEqual({ content_item_id: "mine" });
    expect(payload[0].evidence[0]).toEqual({ content_item_id: "r0", lift_at_creation: 5 });
  });
});

describe("rakipsiz mod ve karma slot dağılımı", () => {
  const mk = (title: string, lift: number, purpose?: "reach" | "sales", mode: "own" | "rivals" = "own"): GeneratedIdea => ({
    ...idea(title, [{ contentItemId: "mine", liftAtCreation: lift }, { contentItemId: "mine2", liftAtCreation: lift }]),
    purpose,
    mode,
  });
  const isOwnId = (id: string) => id.startsWith("mine");
  const schedule: WeeklyPlanSections["schedule"] = {
    postsPerWeek: 3,
    audienceTimeZone: "Europe/Istanbul",
    slots: [1, 2, 3].map((position) => ({ position, at: `2026-10-0${4 + position}T17:00:00.000Z`, weekday: position, hour: 20, basis: "own_good" as const })),
  };

  it("rakipsiz modda puan KENDİ kanıt ortalamasıdır (0 değil), yenilik çarpanı yok; rakip modunda aynı fikir 0 puanlı", () => {
    const [top, low] = rankIdeas([mk("düşük", 1.6), mk("yüksek", 4.2)], isOwnId, "own");
    expect(top.idea.title).toBe("yüksek");
    expect(top).toMatchObject({ score: 4.2, meanOwnLift: 4.2, novelty: 1, mode: "own" });
    expect(low.score).toBe(1.6);
    expect(rankIdeas([mk("x", 4.2)], isOwnId, "rivals")[0].score).toBe(0);
  });

  it("fikre mod ve amaç yazılır (rank_inputs + details); rakipsiz modda meanRivalLift null", () => {
    const [first] = toPayloadIdeas(rankIdeas([mk("a", 3, "reach")], isOwnId, "own"), schedule, { accountType: "creator" });
    expect(first.rank_inputs).toMatchObject({ mode: "own", purpose: "reach", meanRivalLift: null, meanOwnLift: 3 });
    expect(first.details).toMatchObject({ planMode: "own", purpose: "reach" });
  });

  it("karma: plana girenler slot amaçlarına göre seçilir (erişim, satış, erişim), kalan aday; slot notunda amaç yazar", () => {
    // Puan sırası satış ağırlıklı: s1 > s2 > r1 > r2 > r3. Slotlar erişim/satış/erişim ister.
    const ranked = rankIdeas([mk("s1", 5, "sales"), mk("s2", 4.5, "sales"), mk("r1", 4, "reach"), mk("r2", 3.5, "reach"), mk("r3", 3, "reach")], isOwnId, "own");
    const payload = toPayloadIdeas(ranked, schedule, { accountType: "mixed" });
    const planned = payload.filter((p) => p.position !== undefined);
    expect(planned.map((p) => [p.position, p.title, p.details.purpose])).toEqual([[1, "r1", "reach"], [2, "s1", "sales"], [3, "r2", "reach"]]);
    expect(planned[1].slot_note).toContain("satış içeriği");
    expect(planned[0].slot_note).toContain("erişim içeriği");
    expect(payload.slice(3).map((p) => p.position)).toEqual([undefined, undefined]);
  });

  it("karma: bir amaçta fikir yoksa en yüksek puanlı kalan alınır (slot boş kalmaz); tek amaçlı türde sıra bozulmaz", () => {
    const onlyReach = rankIdeas([mk("r1", 4, "reach"), mk("r2", 3, "reach"), mk("r3", 2, "reach")], isOwnId, "own");
    expect(toPayloadIdeas(onlyReach, schedule, { accountType: "mixed" }).map((p) => p.position)).toEqual([1, 2, 3]);
    const business = rankIdeas([mk("a", 4, "sales"), mk("b", 3, "sales"), mk("c", 2, "sales")], isOwnId, "own");
    expect(toPayloadIdeas(business, schedule, { accountType: "business" }).map((p) => p.title)).toEqual(["a", "b", "c"]);
    expect(toPayloadIdeas(business, schedule, { accountType: "business" })[0].slot_note).not.toContain("içeriği");
  });
});

describe("isVoiceFresh", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const trait = (verified: boolean) => ({ key: "k", label: "l", description: "d", verified, examples: [] });
  const usable = { traits: Array.from({ length: 5 }, () => trait(true)), generatedAt: "2026-09-28T00:00:00Z" };

  it("kullanılabilir + ≤14 gün + sonrasında yeni transcript yok → taze", () => {
    expect(isVoiceFresh({ profile: usable, now, ownTranscriptTimes: ["2026-09-20T00:00:00Z"] })).toBe(true);
  });
  it("profilden sonra transcript oluştuysa, eskiyse, kullanılamazsa ya da yoksa bayat", () => {
    expect(isVoiceFresh({ profile: usable, now, ownTranscriptTimes: ["2026-09-29T00:00:00Z"] })).toBe(false);
    expect(isVoiceFresh({ profile: { ...usable, generatedAt: "2026-09-01T00:00:00Z" }, now, ownTranscriptTimes: [] })).toBe(false);
    expect(isVoiceFresh({ profile: { ...usable, traits: [trait(true)] }, now, ownTranscriptTimes: [] })).toBe(false);
    expect(isVoiceFresh({ profile: null, now, ownTranscriptTimes: [] })).toBe(false);
  });
});
