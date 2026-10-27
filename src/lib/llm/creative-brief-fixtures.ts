/** Yalnız testler için: kreatif direktör brifi örnek girdisi ve geçerli model çıktısı (üretim koduna girmez). */
import type { CreativeBriefInput } from "@/lib/llm/creative-brief";
import type { RawCreativeBrief } from "@/lib/llm/creative-brief-schema";

export const BRIEF_INPUT: CreativeBriefInput = {
  slotCount: 4,
  account: { type: "business", purpose: "Güven → müşteri → satış", contentMix: { reach: 0, sales: 1 } },
  niche: "Yapay zekayı işte kullanmak isteyenler için kısa videolar.",
  directions: [
    { ref: "F1", label: "60–90 sn", group: "duration_bucket", confidence: "medium", ownTried: false, rationale: "Uzun videolar daha çok izlenmiş." },
    { ref: "F2", label: "Seslenme", group: "hook_type", confidence: "low", ownTried: true },
  ],
  cards: [
    { id: "topic:c1:question", label: "Verimlilik · soru", kind: "proven", accounts: 3, confidence: "high", ownTried: false, medianLift: 4.1 },
    { id: "topic:c2:callout", label: "Araçlar · seslenme", kind: "proven", accounts: 2, confidence: "medium", ownTried: false, medianLift: 3.4 },
    { id: "topic:c3:story", label: "Gündem · hikâye", kind: "single", accounts: 1, confidence: "low", ownTried: true, medianLift: 5.6 },
  ],
  anatomy: ["Açılış cümlen kazananlardan daha uzun."],
  voiceSummary: "Sakin, net, uygulamalı anlatım.",
  lastWeek: { weekStart: "2026-10-19", summary: "Araç tanıtımları öne çıktı.", ideas: ["Araç turu"], verdicts: ["60–90 sn: tuttu"] },
};

/** `BRIEF_INPUT` için denetimden geçen brif (4 slot: 3 uyarlama, 1 deneme; geçen hafta var). */
export function validRawBrief(): RawCreativeBrief {
  return {
    theme: "Bu hafta işte vakit kazandıran küçük yapay zeka alışkanlıklarını anlatıyoruz.",
    pillars: [
      { pillar: "Verimlilik", slots: 2 },
      { pillar: "Araçlar", slots: 2 },
    ],
    testVariable: { kind: "hook_type", value: "soru ile açılış", why: "Soru ile açılışı bu hesap henüz hiç denemedi." },
    continuity: { mode: "continue", note: "Geçen haftanın araç tanıtımı serisini sürdürüyoruz." },
    slots: [
      { slotId: "S1", decision: "adapt", pillar: "Verimlilik", why: "Bu konu birçok hesapta tutmuş.", evidenceRef: "topic:c1:question" },
      { slotId: "S2", decision: "adapt", pillar: "Araçlar", why: "Doğrudan seslenen açılış rakiplerde işe yaramış.", evidenceRef: "topic:c2:callout" },
      { slotId: "S3", decision: "test", pillar: "Verimlilik", testValue: "soru ile açılış", why: "Haftanın denemesi burada.", evidenceRef: "F2" },
      { slotId: "S4", decision: "adapt", pillar: "Araçlar", why: "Gündem hikâyesi tek hesapta çok tutmuş.", evidenceRef: "topic:c3:story" },
    ],
  };
}
