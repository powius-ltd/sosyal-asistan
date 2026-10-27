/**
 * Kreatif direktör brifinin şeması (modelin ham çıktısı) ve doğrulanmış tipi. Brif haftalık planın başındaki beş karardır:
 * (1) haftanın teması (tek cümle), (2) sütun dağılımı (sütun → slot sayısı), (3) oran (~%70 kanıtlanmış uyarlama / ~%30 deneme),
 * (4) haftanın TEK deneme değişkeni, (5) geçen haftayla süreklilik. Her slot bir karar taşır (`adapt` → kart kimliği,
 * `test` → değişkenin değeri), tek cümle "neden" ve kanıt ref'i (kart kimliği ya da yön `F1..`). Şema yalnız biçimdir; kurallar
 * `creative-brief-validate.ts`'te kodla denetlenir. Metin alanları HEP Türkçe düz dildir (panelde müşteri okur).
 */
import "server-only";

import { z } from "zod";

/** Haftanın deneme değişkeni: bunlardan BİRİ (kullanıcı kararı 2026-10-19/20). */
export const TEST_VARIABLE_KINDS = ["hook_type", "duration", "format", "cta", "topic"] as const;
export type TestVariableKind = (typeof TEST_VARIABLE_KINDS)[number];

export const TEST_VARIABLE_LABEL: Record<TestVariableKind, string> = {
  hook_type: "açılış biçimi",
  duration: "süre",
  format: "anlatım biçimi",
  cta: "çağrı",
  topic: "konu",
};

export const CONTINUITY_MODES = ["continue", "break", "first_week"] as const;
export type ContinuityMode = (typeof CONTINUITY_MODES)[number];

export const CONTINUITY_LABEL: Record<ContinuityMode, string> = {
  continue: "geçen haftanın devamı",
  break: "bilinçli kırılma",
  first_week: "ilk hafta",
};

export const SLOT_DECISIONS = ["adapt", "test"] as const;
export type SlotDecision = (typeof SLOT_DECISIONS)[number];

export const SLOT_DECISION_LABEL: Record<SlotDecision, string> = { adapt: "kanıtlanmış fikri uyarla", test: "deneme" };

/** Yön ref'i biçimi (`F1..`); kart kimlikleri bu biçimde değildir. */
const DIRECTION_REF = /^F\d+$/;

/** Slotun takvimde görünen etiketi KODLA: kartsız (yön ref'li) uyarlama "kanıtlanmış fikri" değil "yönü" uyarlar. */
export function slotDecisionLabel(slot: { decision: SlotDecision; evidenceRef: string }): string {
  if (slot.decision === "adapt" && DIRECTION_REF.test(slot.evidenceRef)) return "yönü uyarla";
  return SLOT_DECISION_LABEL[slot.decision];
}

/** Slot kimliği: `S1..Sn` (sıra = takvimdeki sıra). */
export const slotIdOf = (index: number): string => `S${index + 1}`;

export const creativeBriefSchema = z.object({
  theme: z.string().min(1).max(220).describe("The week's theme in ONE plain Turkish sentence, no digits"),
  pillars: z
    .array(z.object({ pillar: z.string().min(1).max(60).describe("Short Turkish content pillar name"), slots: z.number().int().min(1).max(5).describe("How many slots this pillar gets") }))
    .min(1)
    .max(5),
  testVariable: z.object({
    kind: z.enum(TEST_VARIABLE_KINDS).describe("The ONE thing tested this week"),
    value: z.string().min(1).max(100).describe("Short Turkish description of what is tried, no digits"),
    why: z.string().min(1).max(300).describe("One Turkish sentence: why test exactly this"),
  }),
  continuity: z.object({
    mode: z.enum(CONTINUITY_MODES),
    note: z.string().min(1).max(300).describe("One Turkish sentence: how this week connects to last week (or why it breaks from it)"),
  }),
  slots: z
    .array(
      z.object({
        slotId: z.string().describe("S1, S2 ... in calendar order"),
        decision: z.enum(SLOT_DECISIONS),
        pillar: z.string().min(1).max(60).describe("One of the pillar names above, spelled the same"),
        testValue: z.string().max(100).optional().describe("Only for decision=test: the value of the test variable this slot tries"),
        why: z.string().min(1).max(300).describe("One Turkish sentence: why this slot does this, no digits"),
        evidenceRef: z.string().describe("A card id (adapt) or a direction ref such as F1 that backs this slot; copied from the input"),
      }),
    )
    .min(1)
    .max(5),
});

export type RawCreativeBrief = z.infer<typeof creativeBriefSchema>;

/** Doğrulanmış brif: ham çıktı + kodun hesapladığı alanlar (oran, kanıt etiketi, kanıt azlığı). */
export interface CreativeBrief {
  theme: string;
  pillars: { pillar: string; slots: number }[];
  /** Kodun slotlardan saydığı oran (modelin beyanı değil). */
  ratio: { adapt: number; test: number };
  testVariable: { kind: TestVariableKind; value: string; why: string };
  continuity: { mode: ContinuityMode; note: string };
  slots: BriefSlot[];
  /** 06 kartı 3'ten azdı: uyarlama slotları yönler ve kendi tutanlarla dolduruldu ("kanıt az" notu). */
  evidenceThin: boolean;
}

export interface BriefSlot {
  slotId: string;
  decision: SlotDecision;
  pillar: string;
  testValue?: string;
  why: string;
  evidenceRef: string;
  /** Kanıtın okunur adı (kart: konu · açılış biçimi; yön: yön etiketi); kodla doldurulur. */
  evidenceLabel: string;
}
