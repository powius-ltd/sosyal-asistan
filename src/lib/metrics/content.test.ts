import { describe, expect, it } from "vitest";

import {
  captionLengthCorrelation,
  durationViewsCorrelation,
  hashtagCountCorrelation,
  hashtagFrequency,
} from "@/lib/metrics/content";
import type { MetricItem } from "@/lib/metrics/types";

function post(id: string, likes: number | undefined, comments: number | undefined, caption?: string, hashtags?: string[]): MetricItem {
  return { id, format: "image", likes, comments, caption, hashtags };
}

// Python fixture (content.py): Türkçe karakter, emoji, ZWJ dizisi, büyük/küçük harf etiketler.
const K: MetricItem[] = [
  post("k1", 120, 4, "Sabah kahvesi ☕ #kahve", ["#Kahve"]),
  post("k2", 300, 20, "Yeni tarif: fırında sütlaç 🍮🍮 çok kolay", ["#kahve", "#tatlı"]),
  post("k3", 80, 1, "", []),
  post("k4", 410, 33, "İstanbul'da en iyi 5 kahveci 👇 kaydet, sonra dene!", ["#KAHVE", "#istanbul", "#tatlı"]),
  post("k5", 95, 7, "kısa", ["#istanbul"]),
  post("k6", undefined, undefined, "ölçülemedi", ["#kahve"]),
  post("k7", 200, 10, "👨‍👩‍👧 aile boyu", ["#tatlı", "#istanbul", "#aile"]),
];

describe("caption uzunluğu", () => {
  it("Python len ile aynı: Unicode kod noktası (UTF-16 birimi değil)", () => {
    const lengths = K.map((k) => [...(k.caption ?? "")].length);
    // Python: [len(c) for c in captions]
    expect(lengths).toEqual([22, 39, 0, 50, 4, 10, 15]);
    expect("👨‍👩‍👧 aile boyu".length).toBe(18); // JS .length burada yanlış olurdu
  });
});

describe("korelasyonlar — Python paritesi", () => {
  it("caption uzunluğu ↔ etkileşim", () => {
    expect(captionLengthCorrelation(K)).toEqual({ label: "caption_uzunlugu_vs_etkilesim", pearsonR: 0.94, n: 6 });
  });

  it("hashtag sayısı ↔ etkileşim", () => {
    expect(hashtagCountCorrelation(K)).toEqual({ label: "hashtag_sayisi_vs_etkilesim", pearsonR: 0.8, n: 6 });
  });

  it("negatif korelasyon", () => {
    const items = [
      [10, 500],
      [40, 300],
      [80, 250],
      [120, 90],
      [200, 40],
    ].map(([len, e], i) => post(`n${i}`, e, 0, "a".repeat(len)));
    expect(captionLengthCorrelation(items).pearsonR).toBe(-0.929);
  });

  it("Python test_hashtag_count_correlation_runs: tam doğrusal → 1", () => {
    const items = [1, 2, 3, 4, 5].map((i) => post(`h${i}`, i * 10, i, "", Array(i).fill("#x")));
    expect(hashtagCountCorrelation(items)).toEqual({ label: "hashtag_sayisi_vs_etkilesim", pearsonR: 1, n: 5 });
  });

  it("n < 3 ya da sabit seri → pearsonR undefined (0 değil)", () => {
    expect(captionLengthCorrelation([post("x", 10, 1, "kısa")])).toEqual({
      label: "caption_uzunlugu_vs_etkilesim",
      pearsonR: undefined,
      n: 1,
    });
    const constant = [1, 2, 3, 4, 5, 6, 7].map((i) => post(`c${i}`, i * 10, i, "", ["#a"]));
    expect(hashtagCountCorrelation(constant)).toEqual({ label: "hashtag_sayisi_vs_etkilesim", pearsonR: undefined, n: 7 });
  });

  it("bilinçli sapma: caption / hashtags undefined olan korelasyona girmez (Python 0 sayar)", () => {
    const withUnknown = [...K, post("u1", 5000, 0, undefined, undefined)];
    expect(captionLengthCorrelation(withUnknown)).toEqual(captionLengthCorrelation(K));
    expect(hashtagCountCorrelation(withUnknown)).toEqual(hashtagCountCorrelation(K));
  });
});

describe("durationViewsCorrelation (ek)", () => {
  const reels: MetricItem[] = [
    { id: "r1", format: "short_video", durationSec: 14.2, views: 24_000, viewsKind: "ig_play_count" },
    { id: "r2", format: "short_video", durationSec: 31, views: 6100, viewsKind: "ig_play_count" },
    { id: "r3", format: "short_video", durationSec: 22.5, views: 9800, viewsKind: "ig_play_count" },
    { id: "r4", format: "short_video", durationSec: 58, views: 3100, viewsKind: "ig_play_count" },
    { id: "r5", format: "short_video", durationSec: 5, views: 1, viewsKind: "ig_view_count" },
    { id: "r6", format: "short_video", views: 50_000, viewsKind: "ig_play_count" },
  ];

  it("yalnız verilen viewsKind; süre ya da views yoksa girmez", () => {
    // pandas: round(corr([14.2,31,22.5,58], [24000,6100,9800,3100]), 3) = -0.799
    expect(durationViewsCorrelation(reels, "ig_play_count")).toEqual({ label: "sure_vs_izlenme", pearsonR: -0.799, n: 4 });
    expect(durationViewsCorrelation(reels, "ig_view_count").pearsonR).toBeUndefined();
  });
});

describe("hashtagFrequency — Python paritesi", () => {
  it("min_uses=3, küçük harf birleştirme, medyana göre (eşitlikte ilk görülen)", () => {
    expect(hashtagFrequency(K)).toEqual([
      { tag: "#kahve", uses: 3, medianEngagement: 320, meanEngagement: 295.7 },
      { tag: "#tatlı", uses: 3, medianEngagement: 320, meanEngagement: 324.3 },
      { tag: "#istanbul", uses: 3, medianEngagement: 210, meanEngagement: 251.7 },
    ]);
  });

  it("tek viral gönderi sıralamayı bozmaz (Python test_hashtag_ranking_resists_single_viral_outlier)", () => {
    const items = [
      ...[100, 120, 110, 95, 105].map((e, i) => post(`v${i}`, e, 0, "", ["#saglam"])),
      ...[50, 60, 5000].map((e, i) => post(`w${i}`, e, 0, "", ["#viral"])),
    ];
    expect(hashtagFrequency(items)).toEqual([
      { tag: "#saglam", uses: 5, medianEngagement: 105, meanEngagement: 106 },
      { tag: "#viral", uses: 3, medianEngagement: 60, meanEngagement: 1703.3 },
    ]);
  });

  it("varsayılan eşik 2 kullanımlık etiketi eler; minUses ayarlanabilir", () => {
    const items = [
      ...[100, 120, 110].map((e, i) => post(`s${i}`, e, 0, "", ["#saglam"])),
      post("i1", 50, 0, "", ["#ikilik"]),
      post("i2", 5000, 0, "", ["#ikilik"]),
    ];
    expect(hashtagFrequency(items).map((h) => h.tag)).toEqual(["#saglam"]);
    expect(hashtagFrequency(items, { minUses: 2 }).map((h) => h.tag)).toEqual(["#ikilik", "#saglam"]);
  });
});
