import { describe, expect, it } from "vitest";

import {
  jaccard,
  MATCH_MAX_PER_IDEA,
  suggestMatches,
  textScore,
  timeScore,
  wordSet,
  type MatchIdea,
  type MatchReel,
} from "@/lib/outcomes/idea-match";

const SLOT = "2026-10-06T16:00:00Z";
const hoursAfter = (h: number) => new Date(Date.parse(SLOT) + h * 3_600_000).toISOString();

const idea = (id: string, over: Partial<MatchIdea> = {}): MatchIdea => ({ id, title: "Başlık", hooks: [], ...over });
const reel = (code: string, over: Partial<MatchReel> = {}): MatchReel => ({ contentItemId: `c-${code}`, shortcode: code, ...over });

describe("zaman puanı: slot −12 sa … +48 sa → 1; ±7 günde 0'a iner", () => {
  it("tam pencerede 1, sınırlarda 1, dışında doğrusal düşer, ±7 günde 0", () => {
    expect(timeScore(SLOT, hoursAfter(0))).toBe(1);
    expect(timeScore(SLOT, hoursAfter(-12))).toBe(1);
    expect(timeScore(SLOT, hoursAfter(48))).toBe(1);
    expect(timeScore(SLOT, hoursAfter(108))).toBeCloseTo(0.5, 6); // 48 sa ile 168 sa arasının ortası
    expect(timeScore(SLOT, hoursAfter(168))).toBe(0);
    expect(timeScore(SLOT, hoursAfter(-168))).toBe(0);
    expect(timeScore(SLOT, hoursAfter(-90))).toBeCloseTo(0.5, 6);
    expect(timeScore(SLOT, hoursAfter(500))).toBe(0);
  });

  it("slot ya da yayın tarihi yoksa 0 (zaman kanıtı yok, tahmin edilmez)", () => {
    expect(timeScore(undefined, hoursAfter(0))).toBe(0);
    expect(timeScore(SLOT, undefined)).toBe(0);
  });
});

describe("metin puanı: foldTurkish kelime Jaccard'ı", () => {
  it("Türkçe büyük/küçük harf ve aksan farkı eşleşmeyi bozmaz", () => {
    expect(jaccard(wordSet("İŞLETME SAHİBİ HATALARI"), wordSet("işletme sahibi hatalari"))).toBe(1);
  });

  it("İngilizce eşleşir; dolgu sözcükleri ve 3 harften kısa sözcükler sayılmaz", () => {
    expect(wordSet("the best way to book a call")).toEqual(new Set(["best", "way", "book", "call"]));
    const a = idea("a", { hooks: ["Stop making this pricing mistake"] });
    expect(textScore(a, reel("x", { caption: "stop making this pricing mistake today" }))).toBeGreaterThan(0.6);
  });

  it("açıklama, analiz hook'u ↔ hook, açıklama taslağı, başlık çiftlerinin en yükseği alınır", () => {
    const i = idea("a", { title: "Alakasız", hooks: ["Bu hata müşterini kaybettirir"], captionDraft: "tamamen başka" });
    expect(textScore(i, reel("x", { caption: "uzun ve alakasız bir açıklama", hookText: "Bu hata müşterini kaybettirir" }))).toBe(1);
  });
});

describe("öneri eşiği, ikinci aday farkı ve sessiz bağ yok", () => {
  const hook = "Fiyatını yükseltmeden önce bu üç soruyu sor";
  const matching = reel("A1", { caption: hook, publishedAt: hoursAfter(5) });

  it("güçlü metin + slot yakınlığı → öneri (skor ≥ 0,45), gerekçeli", () => {
    const [suggestion] = suggestMatches([idea("i1", { hooks: [hook], plannedAt: SLOT })], [matching]);
    expect(suggestion).toMatchObject({ ideaId: "i1", contentItemId: "c-A1", shortcode: "A1" });
    expect(suggestion.score).toBeCloseTo(1, 6);
    expect(suggestion.reasons.join(" ")).toMatch(/Metin benzerliği/);
  });

  it("eşik altı → öneri yok: yalnız zaman (metin sıfır) 0,40 < 0,45", () => {
    expect(suggestMatches([idea("i1", { hooks: ["tamamen farklı konu"], plannedAt: SLOT })], [matching])).toEqual([]);
  });

  it("slotsuz fikir yalnız çok güçlü metinle öneri alır (0,6 × metin ≥ 0,45 → metin ≥ 0,75)", () => {
    expect(suggestMatches([idea("i1", { hooks: [hook] })], [matching])).toHaveLength(1);
    expect(suggestMatches([idea("i1", { hooks: ["Fiyatını yükseltmeden önce bu soruları sor"] })], [matching])).toEqual([]);
  });

  it("ikinci aday farkı < 0,10 → belirsiz, öneri YOK; fark ≥ 0,10 → önerilir", () => {
    const twin = suggestMatches([idea("i1", { hooks: [hook], plannedAt: SLOT }), idea("i2", { hooks: [hook], plannedAt: SLOT })], [matching]);
    expect(twin).toEqual([]);

    const distinct = suggestMatches(
      [idea("i1", { hooks: [hook], plannedAt: SLOT }), idea("i2", { hooks: ["Fiyatını yükseltmeden önce bu soru"], plannedAt: SLOT })],
      [matching],
    );
    expect(distinct.map((s) => s.ideaId)).toEqual(["i1"]);
  });

  it("daha önce bağlanmış/reddedilmiş (fikir, kod) çifti tekrar önerilmez", () => {
    const ideas = [idea("i1", { hooks: [hook], plannedAt: SLOT })];
    expect(suggestMatches(ideas, [matching], new Set(["i1|A1"]))).toEqual([]);
  });

  it("Reels başına en çok 1 öneri, fikir başına en çok 3", () => {
    const reels = ["R1", "R2", "R3", "R4", "R5"].map((code) => reel(code, { caption: hook, publishedAt: hoursAfter(2) }));
    const result = suggestMatches([idea("i1", { hooks: [hook], plannedAt: SLOT })], reels);
    expect(result).toHaveLength(MATCH_MAX_PER_IDEA);
    expect(new Set(result.map((s) => s.contentItemId)).size).toBe(MATCH_MAX_PER_IDEA);
  });

  it("sonuç yalnız öneri verisidir: skor 0..1, bağ/durum alanı yok (sessiz bağ üretilmez)", () => {
    const [suggestion] = suggestMatches([idea("i1", { hooks: [hook], plannedAt: SLOT })], [matching]);
    expect(Object.keys(suggestion).sort()).toEqual(["contentItemId", "ideaId", "reasons", "score", "shortcode", "textScore", "timeScore"]);
    expect(suggestion.score).toBeGreaterThanOrEqual(0);
    expect(suggestion.score).toBeLessThanOrEqual(1);
  });
});
