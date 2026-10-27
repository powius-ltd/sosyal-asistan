import { describe, expect, it } from "vitest";

import { emptyPlanSections, type WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import { parsePlanSections, WEEKLY_PLAN_SECTIONS_SCHEMA } from "@/lib/data/weekly-plan-schema";

const sample = (): WeeklyPlanSections => ({
  winners: {
    rivals: [{ contentItemId: "c1", ownerHandle: "ornekrakipbir", isOwn: false, lift: 4.2, durationSec: 92, hookType: "bold_claim", analyzed: true, why: "Açılış cesur iddia.", quote: { contentItemId: "c1", text: "You are not behind." } }],
    own: [],
    relaxedThreshold: false,
  },
  focus: {
    directions: [{ group: "duration_bucket", value: "over_90", label: "90 sn ve üstü", impact: 1.23, novelty: 1.5, score: 1.85, sampleSize: 13, confidence: "high", ownTried: false, evidenceContentIds: ["c1"] }],
  },
  schedule: {
    postsPerWeek: 3,
    audienceTimeZone: "America/New_York",
    slots: [{ position: 1, at: "2026-10-06T11:00:00.000Z", weekday: 1, hour: 7, basis: "rival_fixed", note: "Rakipler 07–08 ET" }],
  },
  avoid: { entries: [{ kind: "low_lift", group: "duration_bucket", value: "under_15", label: "15 sn altı", medianLift: 0.54, sampleSize: 9, confidence: "medium", reason: "9 videoda 0 tutan." }] },
  review: { status: "awaiting_publish_data" },
});

describe("WEEKLY_PLAN_SECTIONS_SCHEMA", () => {
  it("geçerli bölümleri olduğu gibi kabul eder", () => {
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(sample()).success).toBe(true);
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(emptyPlanSections()).success).toBe(true);
  });

  it("yön gerekçesinin alıntısı (rationaleQuote) isteğe bağlıdır; verilince biçimi doğrulanır ve JSON gidiş-dönüşünde korunur", () => {
    const withQuote = sample();
    withQuote.focus.directions[0].rationale = "Uzun videolar daha çok izlenmiş.";
    withQuote.focus.directions[0].rationaleQuote = { contentItemId: "c1", ownerHandle: "ornekrakipbir", text: "You are not behind." };
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(withQuote).success).toBe(true);
    expect(parsePlanSections(JSON.parse(JSON.stringify(withQuote))).focus.directions[0].rationaleQuote).toEqual({ contentItemId: "c1", ownerHandle: "ornekrakipbir", text: "You are not behind." });
    const badQuote = JSON.parse(JSON.stringify(withQuote));
    badQuote.focus.directions[0].rationaleQuote = { text: "kimliksiz alıntı" };
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(badQuote).success).toBe(false);
  });

  it("negatif lift, geçersiz güven düzeyi ve bilinmeyen grup reddedilir", () => {
    const bad = sample();
    bad.winners.rivals[0].lift = -1;
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(bad).success).toBe(false);
    const badConfidence = JSON.parse(JSON.stringify(sample()));
    badConfidence.focus.directions[0].confidence = "kesin";
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(badConfidence).success).toBe(false);
    const badGroup = JSON.parse(JSON.stringify(sample()));
    badGroup.avoid.entries[0].group = "renk";
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(badGroup).success).toBe(false);
  });
});

describe("parsePlanSections", () => {
  it("geçerli bölümler korunur", () => {
    expect(parsePlanSections(sample())).toEqual(sample());
  });

  it("biçimsiz bölüm yalnız kendi yerine boş bölüm bırakır; diğerleri korunur", () => {
    const raw = { ...sample(), focus: { directions: "yok" } };
    const parsed = parsePlanSections(raw);
    expect(parsed.focus).toEqual({ directions: [] });
    expect(parsed.winners).toEqual(sample().winners);
    expect(parsed.schedule).toEqual(sample().schedule);
  });

  it("nesne olmayan girdi → tümü boş bölüm", () => {
    for (const value of [null, undefined, 5, "x", []]) expect(parsePlanSections(value), String(value)).toEqual(emptyPlanSections());
  });

  it("eksik bölüm (ör. review yok) boş bölümle tamamlanır", () => {
    const partial: Partial<WeeklyPlanSections> = sample();
    delete partial.review;
    expect(parsePlanSections(partial).review).toEqual({ status: "awaiting_publish_data" });
  });
});
