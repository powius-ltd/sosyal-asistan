import { describe, expect, it } from "vitest";

import type { AdUsage } from "@/lib/domain/ads";
import type { ContentItem } from "@/lib/domain/content";
import { adUsageMarks, organicAdMarks } from "@/lib/matrix/ad-organic";

const NOW = new Date("2026-10-20T09:00:00.000Z");
const item = (id: string, over: { own?: boolean; lift?: number; ageDays?: number; status?: ContentItem["analysisStatus"]; lowConfidence?: boolean } = {}): ContentItem =>
  ({
    id,
    owner: { kind: over.own === false ? "competitor" : "own", id: "o", handle: "h" },
    publishedAt: new Date(NOW.getTime() - (over.ageDays ?? 10) * 86_400_000).toISOString(),
    score: { lift: over.lift ?? 3, liftTier: 3, lowConfidence: over.lowConfidence ?? false },
    analysisStatus: "status" in over ? over.status : "ok",
  }) as unknown as ContentItem;
const usage = (contentItemId: string, signal: AdUsage["signal"]): AdUsage => ({ contentItemId, creativeCount: 1, signal, confidence: "high", adRefs: [`ad:${contentItemId}`] });

describe("organicAdMarks", () => {
  it("reklamda kullanılan içerik kullanım işareti alır; kullanılmayan tutan kendi video 'aday' olur", () => {
    const marks = organicAdMarks([item("a"), item("b")], [usage("a", "worked")], NOW);
    expect(marks.a).toEqual({ kind: "used", signal: "worked", confidence: "high" });
    expect(marks.b).toEqual({ kind: "candidate" });
  });
  it("rakip videosu hiçbir işaret almaz", () => {
    expect(organicAdMarks([item("r", { own: false, lift: 6 })], [], NOW)).toEqual({});
  });
  it("aday kuralı: eski (60 gün üstü), düşük lift, düşük güven ya da analizsiz video aday olmaz", () => {
    const marks = organicAdMarks([item("eski", { ageDays: 90 }), item("dusuk", { lift: 1.2 }), item("zayif", { lowConfidence: true }), item("analizsiz", { status: undefined })], [], NOW);
    expect(marks).toEqual({});
  });
  it("adUsageMarks yalnız kullanım işareti üretir", () => {
    expect(adUsageMarks([usage("x", "fatigued")])).toEqual({ x: { kind: "used", signal: "fatigued", confidence: "high" } });
  });
});
