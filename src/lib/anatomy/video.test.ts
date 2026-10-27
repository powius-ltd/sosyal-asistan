import { describe, expect, it } from "vitest";

import { NOW, SECTIONS, video } from "@/lib/anatomy/test-fixtures";
import { deriveVideoAnatomy } from "@/lib/anatomy/video";
import type { Transcript } from "@/lib/domain/intel";

function derive(spec: Parameters<typeof video>[0], transcript?: Transcript, now?: Date) {
  const { item, analysis } = video(spec);
  return deriveVideoAnatomy({ item, analysis: analysis!, transcript, now });
}

const transcript = (over: Partial<Transcript> = {}): Transcript => ({
  id: "t1", contentItemId: "v1", wordCount: 50, isMeaningful: true, source: "apify", createdAt: "2026-09-01T00:00:00.000Z",
  text: "metin", segments: [{ startSec: 3, text: "Dur", channel: "screen" }, { startSec: 1, text: "Merhaba", channel: "speech" }, { startSec: 30, text: "Yorum yaz", channel: "screen" }],
  ...over,
});

describe("deriveVideoAnatomy", () => {
  it("fazlar, hook kelimesi, ilk bölüme geçiş, CTA konumu ve gövde türleri", () => {
    const a = derive({ id: "v1", own: true, lift: 4.2, edit: { cutsPerMinute: 12, onScreenTextCount: 2 } });
    expect(a).toMatchObject({ contentItemId: "v1", isOwn: true, ownerHandle: "ornek", durationSec: 92, lift: 4.2, liftTier: 3 });
    expect(a?.phases.map((p) => [p.phase, p.startSec, p.endSec])).toEqual([
      ["hook", 0, 16],
      ["intro", 16, 21],
      ["body", 21, 80],
      ["cta", 80, 92],
    ]);
    expect(a?.hookWords).toBe(4);
    expect(a?.firstSectionAtSec).toBe(16);
    // CTA 80. sn'de başlıyor, video 92 sn: 12 sn kala → "sondan 6–15 sn".
    expect(a?.ctaPosition).toBe("6_15s");
    expect(a?.bodyTypes).toEqual(["proof", "insight"]);
    expect(a?.unmeasured.hookWords).toBeUndefined();
    expect(a?.unmeasured.cutsPerMinute).toBeUndefined();
  });

  it("analiz ok değilse üretilmez", () => {
    const { item, analysis } = video({ id: "v1" });
    expect(deriveVideoAnatomy({ item, analysis: { ...analysis!, status: "failed" } })).toBeUndefined();
  });

  it("CTA bölümü yoksa `none` (ölçülmüş); bölüm hiç yoksa ölçülemez + sebep", () => {
    expect(derive({ id: "v1", sections: SECTIONS.filter((s) => s.type !== "cta") })?.ctaPosition).toBe("none");
    const empty = derive({ id: "v1", sections: [] });
    expect(empty).toMatchObject({ phases: [], ctaPosition: undefined, firstSectionAtSec: undefined });
    expect(empty?.unmeasured).toMatchObject({ phases: expect.stringContaining("bölüm yok"), ctaPosition: expect.any(String), firstSectionAtSec: expect.any(String) });
  });

  it("CTA var ama süre/zaman yoksa konum undefined + sebep (0 ya da 'yok' değil)", () => {
    const { item, analysis } = video({ id: "v1" });
    const noDuration = deriveVideoAnatomy({ item: { ...item, durationSec: undefined }, analysis: analysis! });
    expect(noDuration?.ctaPosition).toBeUndefined();
    expect(noDuration?.unmeasured.ctaPosition).toContain("süresi");
    const noStart = derive({ id: "v1", sections: [{ type: "hook", quote: "a b", startSec: 0 }, { type: "cta", quote: "yaz" }] });
    expect(noStart?.ctaPosition).toBeUndefined();
    expect(noStart?.unmeasured.ctaPosition).toContain("başlangıç");
  });

  it("hook metni yok / kurgu ölçümü yok → sebepli undefined", () => {
    const a = derive({ id: "v1", hookText: "   " });
    expect(a?.hookWords).toBeUndefined();
    expect(a?.unmeasured.hookWords).toBeTruthy();
    expect(a?.unmeasured.cutsPerMinute).toContain("Kurgu ölçümü yok");
    expect(derive({ id: "v1", edit: { cutCount: 3 } })?.unmeasured.cutsPerMinute).toContain("kesme");
  });

  it("ekran yazısı zamanları transcript'ten (yalnız ekran kanalı, sıralı); transcript yok/süresi dolmuş → undefined + sebep", () => {
    expect(derive({ id: "v1" }, transcript())?.screenTextAtSec).toEqual([3, 30]);
    expect(derive({ id: "v1" })?.unmeasured.screenText).toContain("konuşma metni yok");

    const expired = transcript({ expiresAt: "2026-09-29T00:00:00.000Z" });
    const masked = derive({ id: "v1" }, expired, NOW);
    expect(masked?.screenTextAtSec).toBeUndefined();
    expect(masked?.unmeasured.screenText).toContain("süresi doldu");
    // Depo zaten maskelemiş transcript verir (segments yok): aynı sonuç.
    expect(derive({ id: "v1" }, transcript({ text: undefined, segments: undefined }))?.unmeasured.screenText).toContain("süresi doldu");
    // Ekran kanalı olmayan (eski) transcript: "yok" denmez, ölçülemez.
    const speechOnly = derive({ id: "v1" }, transcript({ segments: [{ startSec: 1, text: "x", channel: "speech" }] }));
    expect(speechOnly?.screenTextAtSec).toBeUndefined();
    expect(speechOnly?.unmeasured.screenText).toContain("ekran yazısı yok");
  });
});
