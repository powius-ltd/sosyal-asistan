/**
 * Örnek üreteçlerin plan / fikir metinleri müşteriye düz dilde gider (D2-03): panel jargonu yok, her tutan videoda aynı "neden tuttu"
 * cümlesi tekrarlanmaz, senaryo satırlarında "Hook" yok.
 */
import { describe, expect, it } from "vitest";

import { buildMockDataset } from "@/lib/data/mock/generators/dataset";
import { winnerWhy } from "@/lib/data/mock/generators/plan-wording";
import { createClock } from "@/lib/data/mock/mock-clock";
import { PANEL_JARGON } from "@/lib/plain-language";

/** `PANEL_JARGON`dan "hücre" ayrı tutulur: örnek senaryo satırında elektronik tablo hücresi (gerçek sözcük) geçer. */
const PLAN_JARGON = new RegExp(PANEL_JARGON.source.replace("|hücre", ""), "i");

const data = buildMockDataset(createClock());

describe("winnerWhy", () => {
  it("açılış tarzına göre değişir ve çarpanı 'katı' diye yazar (baz çizgisi / x yok)", () => {
    const question = winnerWhy("question", 19.1);
    expect(question).toBe("Açılış cümlesi izleyiciye doğrudan bir soru soruyor; video normalinin 19,1 katı izlendi.");
    expect(winnerWhy("list", 3)).not.toBe(winnerWhy("question", 3));
    expect(winnerWhy("yeni_tur", undefined)).toBe("Açılış cümlesi dikkat çekici bir açılışla başlıyor.");
    expect(question).not.toMatch(PANEL_JARGON);
  });
});

describe("mock fikir ve plan metinleri", () => {
  it("fikir gerekçesi, senaryo adımları ve plan bölümleri panel jargonu taşımaz", () => {
    for (const idea of data.ideas) {
      expect(idea.rationale, idea.id).not.toMatch(PLAN_JARGON);
      for (const step of idea.scriptOutline) expect(step, idea.id).not.toMatch(PLAN_JARGON);
    }
    for (const stored of data.weeklyPlans) {
      const { winners, focus, avoid } = stored.sections;
      for (const winner of [...winners.rivals, ...winners.own]) expect(winner.why ?? "", winner.contentItemId).not.toMatch(PLAN_JARGON);
      for (const direction of focus.directions) expect(direction.rationale ?? "", direction.label).not.toMatch(PLAN_JARGON);
      for (const entry of avoid.entries.filter((e) => e.kind === "low_lift")) expect(entry.reason, entry.label).not.toMatch(PLAN_JARGON);
    }
  });

  it("tutan videoların 'neden tuttu' cümlesi açılış tarzına göre ayrışır (hepsi aynı cümle değil)", () => {
    const reasons = data.weeklyPlans.flatMap((p) => [...p.sections.winners.rivals, ...p.sections.winners.own]).flatMap((w) => (w.why ? [w.why.replace(/;.*/, "")] : []));
    expect(reasons.length).toBeGreaterThan(2);
    expect(new Set(reasons).size).toBeGreaterThan(1);
  });
});
