import { describe, expect, it } from "vitest";

import {
  CTA_TYPES,
  CTA_TYPE_LABEL,
  DURATION_BUCKETS,
  DURATION_BUCKET_LABEL,
  IDEA_FRAMES,
  IDEA_FRAME_LABEL,
  LABEL_AXES,
  LABEL_AXIS_LABEL,
  SECTION_TYPES,
  SECTION_TYPE_LABEL,
  durationBucketOf,
} from "@/lib/domain/taxonomy";

describe("taksonomi etiketleri", () => {
  it("her anahtarın Türkçe etiketi var (boş değil)", () => {
    for (const key of SECTION_TYPES) expect(SECTION_TYPE_LABEL[key].trim(), key).not.toBe("");
    for (const key of LABEL_AXES) expect(LABEL_AXIS_LABEL[key].trim(), key).not.toBe("");
    for (const key of IDEA_FRAMES) expect(IDEA_FRAME_LABEL[key].trim(), key).not.toBe("");
    for (const key of CTA_TYPES) expect(CTA_TYPE_LABEL[key].trim(), key).not.toBe("");
    for (const key of DURATION_BUCKETS) expect(DURATION_BUCKET_LABEL[key].trim(), key).not.toBe("");
  });

  it("müşteri dili: 'Hook' ve 'CTA türü' kaynakta düz dile çevrilmiş", () => {
    expect(SECTION_TYPE_LABEL.hook).toBe("Açılış");
    expect(LABEL_AXIS_LABEL.cta_type).toBe("İzleyiciden istenen şey");
    expect(CTA_TYPE_LABEL.none).toBe("Çağrı yok");
    expect(CTA_TYPE_LABEL.dm).toBe("Mesaj atma çağrısı");
  });

  it("bölüm tipleri planla aynı: hook/story/problem/insight/proof/practice/cta", () => {
    expect([...SECTION_TYPES]).toEqual(["hook", "story", "problem", "insight", "proof", "practice", "cta"]);
    expect([...LABEL_AXES]).toEqual(["topic", "tone", "frame", "cta_type"]);
    expect([...IDEA_FRAMES]).toEqual(["faith", "science", "personal", "practical"]);
  });
});

describe("durationBucketOf", () => {
  it("sınırlar alt uçta dahildir", () => {
    expect(
      [0, 14.9, 15, 29.99, 30, 59, 60, 89.9, 90, 128].map(durationBucketOf),
    ).toEqual(["under_15", "under_15", "15_30", "15_30", "30_60", "30_60", "60_90", "60_90", "over_90", "over_90"]);
  });

  it("süre bilinmiyor/geçersiz → undefined (0 sn kovasına girmez)", () => {
    expect([undefined, Number.NaN, Number.POSITIVE_INFINITY, -1].map(durationBucketOf)).toEqual([undefined, undefined, undefined, undefined]);
  });
});
