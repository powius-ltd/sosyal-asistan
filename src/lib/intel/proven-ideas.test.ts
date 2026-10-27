import { describe, expect, it } from "vitest";
import { video } from "@/lib/anatomy/test-fixtures";
import type { VideoSpec } from "@/lib/anatomy/test-fixtures";
import type { ContentItem } from "@/lib/domain/content";
import type { ContentAnalysis } from "@/lib/domain/intel";
import { buildProvenIdeas, durationBucketOf, type ProvenClusterRow } from "@/lib/intel/proven-ideas";

interface Spec extends VideoSpec {
  rival?: string;
  hook?: string;
  cluster?: string | null;
  platform?: ContentItem["platform"];
}

function make(specs: Spec[], offNiche: string[] = []) {
  const items: ContentItem[] = [];
  const analyses: ContentAnalysis[] = [];
  const clusters: ProvenClusterRow[] = [];
  for (const spec of specs) {
    const { item, analysis } = video(spec);
    if (spec.rival !== undefined) item.owner = { kind: "competitor", id: spec.rival, handle: spec.rival };
    if (spec.platform !== undefined) item.platform = spec.platform;
    items.push(item);
    if (analysis) analyses.push({ ...analysis, hookType: spec.hook ?? "question" });
    if (spec.cluster !== null) clusters.push({ contentItemId: spec.id, clusterKey: spec.cluster ?? "kahve", clusterLabel: "Kahve", clusteredAt: "2026-09-30T00:00:00.000Z" });
  }
  return buildProvenIdeas({ items, analyses, clusters, offNicheContentIds: offNiche });
}

describe("buildProvenIdeas", () => {
  it("2 farklı hesapta ≥ 3x → proven", () => {
    const ideas = make([{ id: "a", lift: 3.5 }, { id: "b", lift: 4, rival: "r2" }]);
    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({ kind: "proven", accountCount: 2, basis: "topic", cellKey: "kahve", hookType: "question", ownTried: false });
    expect(ideas[0].evidence.map((e) => e.contentItemId)).toEqual(["b", "a"]);
  });

  it("tek hesapta 5x → single", () => {
    const ideas = make([{ id: "a", lift: 5.5 }]);
    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({ kind: "single", accountCount: 1 });
  });

  it("aynı hesabın iki videosu 2 hesap sayılmaz; tek hesap 3x kart değil", () => {
    expect(make([{ id: "a", lift: 3.2 }])).toHaveLength(0);
    expect(make([{ id: "a", lift: 3.2 }, { id: "b", lift: 4.1 }])).toHaveLength(0);
  });

  it("lift ölçülemeyen ya da olgunlaşmamış video sayılmaz (undefined ≠ 0)", () => {
    expect(make([{ id: "a", lift: 6 }, { id: "b", lift: undefined, rival: "r2" }])[0].kind).toBe("single");
    expect(make([{ id: "a", lift: 4 }, { id: "b", lift: 9, immature: true, rival: "r2" }])).toHaveLength(0);
  });

  it("niş dışı, doğrulanmamış analiz ve analizsiz video girmez", () => {
    expect(make([{ id: "a", lift: 4 }, { id: "b", lift: 4, rival: "r2" }], ["b"])).toHaveLength(0);
    expect(make([{ id: "a", lift: 4 }, { id: "b", lift: 4, rival: "r2", verified: false }])).toHaveLength(0);
    expect(make([{ id: "a", lift: 4 }, { id: "b", lift: 4, rival: "r2", noAnalysis: true }])).toHaveLength(0);
  });

  it("2 platform tek hesapla olsa da proven", () => {
    const ideas = make([{ id: "a", lift: 3.4 }, { id: "b", lift: 3.6, platform: "tiktok" }]);
    expect(ideas[0]).toMatchObject({ kind: "proven", platformCount: 2 });
  });

  it("sıra: proven önce, sonra hesap sayısı, sonra medyan lift", () => {
    const ideas = make([
      { id: "s", lift: 9, hook: "story_open", cluster: "x" },
      { id: "p1", lift: 3, hook: "question", cluster: "y" },
      { id: "p2", lift: 3.1, hook: "question", cluster: "y", rival: "r2" },
    ]);
    expect(ideas.map((i) => i.kind)).toEqual(["proven", "single"]);
  });

  it("kendi denedi mi: hücrede kendi video var", () => {
    const ideas = make([{ id: "a", lift: 3.5, own: true }, { id: "b", lift: 4, rival: "r2" }]);
    expect(ideas[0].ownTried).toBe(true);
  });

  it("kümeleme hiç yoksa süre kovası × hook türü hücresine düşer", () => {
    const ideas = make([{ id: "a", lift: 3.5, cluster: null, durationSec: 40 }, { id: "b", lift: 4, rival: "r2", cluster: null, durationSec: 45 }]);
    expect(ideas[0]).toMatchObject({ basis: "duration", cellKey: "30_60", cellLabel: "30–60 sn" });
  });

  it("anatomi özeti kanıt videolarının baskın kovası", () => {
    const [idea] = make([{ id: "a", lift: 3.5, durationSec: 90 }, { id: "b", lift: 4, rival: "r2", durationSec: 70 }]);
    expect(idea.anatomy.hookLength).toMatchObject({ bucket: "1_6", measured: 2 });
    expect(idea.anatomy.firstSection.bucket).toBe("10_20");
    expect(idea.anatomy.ctaPosition.bucket).toBe("6_15s");
    expect(idea.anatomy.tempo).toEqual({ bucket: undefined, count: 0, measured: 0 });
    expect(idea.anatomy.medianDurationSec).toBe(80);
  });
});

describe("durationBucketOf", () => {
  it("sınırlar", () => {
    expect(durationBucketOf(14.9)).toBe("under_15");
    expect(durationBucketOf(15)).toBe("15_30");
    expect(durationBucketOf(60)).toBe("over_60");
    expect(durationBucketOf(undefined)).toBeUndefined();
  });
});
