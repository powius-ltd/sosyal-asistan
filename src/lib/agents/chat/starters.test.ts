import { describe, expect, it } from "vitest";

import type { StarterSignals } from "@/lib/agents/chat/starter-signals";
import { chatStarters } from "@/lib/agents/chat/starters";

const ALL: StarterSignals = { hasPlan: true, hasOwnBest: true, hasLatest: true, hasTopicWinners: true, hasAngleOpportunity: true };
const NONE: StarterSignals = { hasPlan: false, hasOwnBest: false, hasLatest: false, hasTopicWinners: false, hasAngleOpportunity: false };

describe("hazır sorular (hesap türü profilinden, tür adına bakmadan; yalnız cevabı olanlar)", () => {
  it("işletme: bu hafta · rakiplerde tutan · son video · en iyi video (4'e sığmayan düşer)", () => {
    expect(chatStarters({ accountType: "business", hasRivals: true, signals: ALL })).toEqual([
      "Bu hafta ne çekmeliyim?",
      "Rakiplerde tutan, bende eksik olan ne?",
      "Son videom nasıl gitti?",
      "En iyi videom nasıl gitti?",
    ]);
  });

  it("işletme rakipsizse ya da fırsat yoksa rakip sorusu çıkmaz", () => {
    expect(chatStarters({ accountType: "business", hasRivals: false, signals: ALL })).toEqual(["Bu hafta ne çekmeliyim?", "Son videom nasıl gitti?", "En iyi videom nasıl gitti?", "Bu plan neye dayanıyor?"]);
    expect(chatStarters({ accountType: "business", hasRivals: true, signals: { ...ALL, hasAngleOpportunity: false } })).not.toContain("Rakiplerde tutan, bende eksik olan ne?");
  });

  it("içerik üreticisi: konu ve açılış soruları; satış/müşteri/rakip sorusu yok", () => {
    const starters = chatStarters({ accountType: "creator", hasRivals: true, signals: ALL });
    expect(starters).toEqual(["Bu hafta ne çekmeliyim?", "Hangi konularım tutuyor?", "Hangi açılış bende işe yarıyor?", "Son videom nasıl gitti?"]);
    expect(starters.join(" ")).not.toMatch(/satış|müşteri|rakip/i);
  });

  it("karma: erişim mi satış mı sorusu + konular", () => {
    expect(chatStarters({ accountType: "mixed", hasRivals: true, signals: ALL })).toEqual([
      "Bu hafta ne çekmeliyim?",
      "Erişim mi satış mı, hangisi daha iyi gidiyor?",
      "Hangi konularım tutuyor?",
      "Son videom nasıl gitti?",
    ]);
  });

  it("cevabı olmayan soru önerilmez: plan yoksa bu hafta / plan dayanağı, tutan video yoksa en iyi video, konu hücresi yoksa konu soruları çıkmaz (D3-11)", () => {
    expect(chatStarters({ accountType: "business", hasRivals: true, signals: { ...ALL, hasPlan: false } })).toEqual([
      "Rakiplerde tutan, bende eksik olan ne?",
      "Son videom nasıl gitti?",
      "En iyi videom nasıl gitti?",
    ]);
    expect(chatStarters({ accountType: "creator", hasRivals: false, signals: { ...ALL, hasTopicWinners: false, hasOwnBest: false, hasLatest: false } })).toEqual(["Bu hafta ne çekmeliyim?"]);
    expect(chatStarters({ accountType: "business", hasRivals: true, signals: NONE })).toEqual([]);
  });

  it("'Son videom' sorusu yalnız tarihli kendi video varken önerilir (her türde)", () => {
    for (const accountType of ["business", "creator", "mixed"] as const) {
      expect(chatStarters({ accountType, hasRivals: true, signals: ALL })).toContain("Son videom nasıl gitti?");
      expect(chatStarters({ accountType, hasRivals: true, signals: { ...ALL, hasLatest: false } }).join(" ")).not.toMatch(/Son videom/);
    }
  });

  it("tür verilmezse varsayılan (işletme) profili; en çok 4 soru", () => {
    expect(chatStarters({ hasRivals: true, signals: ALL })).toHaveLength(4);
  });
});
