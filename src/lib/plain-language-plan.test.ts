import { describe, expect, it } from "vitest";

import { CONFIDENCE_LEVELS } from "@/lib/domain/weekly-plan";
import { CONFIDENCE_PLAIN, PANEL_JARGON } from "@/lib/plain-language";
import {
  ALTERNATIVES_PLAIN,
  atLeastTimesPlain,
  AVOID_KIND_PLAIN,
  AVOID_PLAIN,
  CONFIDENCE_CAPPED_PLAIN,
  confidenceBadgePlain,
  confidenceBasisPlain,
  FOCUS_GROUP_PLAIN,
  FOCUS_PLAIN,
  focusFactsPlain,
  focusTypicalPlain,
  IDEA_PLAIN,
  MEASUREMENT_DUE_PLAIN,
  OPENING_PLAIN,
  plainOrFallback,
  PLAN_SCREEN_PLAIN,
  REVIEW_PLAIN,
  upperFirst,
  WINNERS_PLAIN,
} from "@/lib/plain-language-plan";

describe("güven", () => {
  it("rozet metni CONFIDENCE_PLAIN'den türer (büyük harfle), jargon yok", () => {
    for (const level of CONFIDENCE_LEVELS) {
      expect(confidenceBadgePlain(level).toLocaleLowerCase("tr-TR")).toBe(CONFIDENCE_PLAIN[level]);
      expect(confidenceBadgePlain(level)).not.toMatch(PANEL_JARGON);
    }
    expect(confidenceBadgePlain("medium")).toBe("Kısmen eminim");
    expect(CONFIDENCE_CAPPED_PLAIN).toContain(CONFIDENCE_PLAIN.medium);
    expect(confidenceBasisPlain(12)).toBe("12 videoya dayanıyor.");
    expect(confidenceBasisPlain(undefined)).toBeUndefined();
  });
});

describe("terimler ve cümleler", () => {
  it("upperFirst Türkçe harfle çalışır", () => {
    expect(upperFirst("izleyiciden istediğin şey")).toBe("İzleyiciden istediğin şey");
    expect(upperFirst("")).toBe("");
  });

  it("ölçüt: 'normalinin en az N katı' (tam sayı ve ondalık)", () => {
    expect(atLeastTimesPlain(3)).toBe("normalinin en az 3 katı izlenenler");
    expect(atLeastTimesPlain(1.5)).toBe("normalinin en az 1,5 katı izlenenler");
    expect(WINNERS_PLAIN.criteria(30, 3)).toBe("son 30 gün · normalinin en az 3 katı izlenenler");
  });

  it("yön cümleleri: tipik video katı, kaç videoya dayandığı, denenip denenmediği; ölçülemeyen etki için cümle kurulmaz", () => {
    expect(focusTypicalPlain(5.91)).toBe("Rakiplerde tipik video normalinin 5,9 katı izlendi.");
    expect(focusTypicalPlain(undefined)).toBeUndefined();
    expect(focusFactsPlain({ sampleSize: 6, ownTried: false })).toBe("6 videoya dayanıyor. Sen bunu henüz denemedin.");
    expect(focusFactsPlain({ sampleSize: 6, ownTried: true })).toContain(FOCUS_PLAIN.tried);
  });

  it("kaçın cümlesi: yapısal alanlardan; ölçülemeyen değer cümleden düşer", () => {
    expect(AVOID_PLAIN.lowSentence("Soru", 5, 0.44)).toBe("Soru: 5 videoya baktım; tipik video normalinin 0,4 katı izlendi.");
    expect(AVOID_PLAIN.lowSentence("Soru", 5, undefined)).toBe("Soru: 5 videoya baktım.");
  });

  it("yedek, açılış ve geçen hafta metinlerinde panel jargonu yok", () => {
    const texts: string[] = [
      ALTERNATIVES_PLAIN.title,
      ALTERNATIVES_PLAIN.intro,
      ALTERNATIVES_PLAIN.count(2),
      ALTERNATIVES_PLAIN.basis(3),
      OPENING_PLAIN.options,
      OPENING_PLAIN.none,
      OPENING_PLAIN.badge("bold_claim"),
      OPENING_PLAIN.unknownHint,
      OPENING_PLAIN.leadsWith("question"),
      ...Object.values(FOCUS_GROUP_PLAIN),
      ...Object.values(AVOID_KIND_PLAIN),
      FOCUS_PLAIN.description,
      FOCUS_PLAIN.unmeasured,
      AVOID_PLAIN.empty,
      WINNERS_PLAIN.relaxedHint(2),
      WINNERS_PLAIN.unverified,
      WINNERS_PLAIN.unverifiedWhy,
      REVIEW_PLAIN.intro("28 Eyl 2026 haftası"),
      REVIEW_PLAIN.summary({ planned: 4, linked: 1, measuredD7: 1, held: 1, missed: 0, unmeasured: 3 }),
      REVIEW_PLAIN.linkAction("video"),
      REVIEW_PLAIN.notMeasured,
      MEASUREMENT_DUE_PLAIN.headline(3),
      PLAN_SCREEN_PLAIN.emptyWeekBody,
      IDEA_PLAIN.evidenceTitle,
      IDEA_PLAIN.scriptTitle,
      IDEA_PLAIN.scoreLabel,
    ];
    for (const text of texts) expect(text, text).not.toMatch(PANEL_JARGON);
  });

  it("platform adı sabit değil: bağlantı eylemi içerik türünü parametre alır; ölçüm şeridi 'yayın' der", () => {
    expect(REVIEW_PLAIN.linkAction("Reels")).toBe("Fikir kartında Reels bağla");
    expect(REVIEW_PLAIN.linkAction("video")).toBe("Fikir kartında video bağla");
    expect(MEASUREMENT_DUE_PLAIN.headline(1)).not.toMatch(/Reels/);
  });

  it("plainOrFallback: jargonlu sunucu cümlesi yerine genel cümle; temiz cümle olduğu gibi", () => {
    expect(plainOrFallback("Son 30 günde lift'i ölçülmüş rakip videosu yok.", "Yeterli veri yok.")).toBe("Yeterli veri yok.");
    expect(plainOrFallback("Kendi en iyi saatin.", "x")).toBe("Kendi en iyi saatin.");
    expect(plainOrFallback(undefined, "x")).toBe("x");
    expect(plainOrFallback("  ", "x")).toBe("x");
  });
});
