/**
 * Kreatif direktör brifinin KOD DENETİMİ (saf; LLM ve DB yok). Model brifi kurar, kod denetler; geçmeyen brif modele sebepleriyle
 * geri verilir (tek düzeltme turu), yine geçmezse plan brifsiz sürer (bugünkü davranış). Kurallar (SPEC 07 "Denetim"):
 *  - slot sayısı beklenenle eşit, kimlikler `S1..Sn`;
 *  - oran: uyarlama slotları hedefin (~%70) ±1'i içinde, en az bir deneme slotu;
 *  - tam bir deneme değişkeni: her deneme slotu değer taşır, uyarlama slotu taşımaz;
 *  - her kanıt ref'i girdide var; 06 kartı ≥ 3 ise uyarlama slotları kart kimliğine dayanır (az ise yön ref'i de olur);
 *  - sütun dağılımı slotlardan sayılanla birebir, toplam = slot sayısı;
 *  - süreklilik: geçen hafta planı yoksa `first_week`, varsa değil;
 *  - düz dil: panel jargonu (`PANEL_JARGON`) yok; metinde rakam, yüzde, sayı sözcüğü, çarpan, belirteç yok; tema tek cümle.
 */
import "server-only";

import { strayNumberProblems } from "@/lib/agents/analyst/tokens";
import { certaintyProblem, isHedgedConfidence, rivalMentionProblem } from "@/lib/llm/brief-tone";
import type { PlanMode } from "@/lib/insights/mode";
import { PANEL_JARGON } from "@/lib/plain-language";
import {
  slotIdOf,
  type BriefSlot,
  type CreativeBrief,
  type RawCreativeBrief,
} from "@/lib/llm/creative-brief-schema";

/** Uyarlama payı hedefi (kullanıcı kararı: slotların ~%70'i kanıtlanmış uyarlama, ~%30 deneme). */
export const ADAPT_SHARE = 0.7;
/** Kartlar bu sayıdan azsa "kanıt az": yön ve kendi tutanlarla doldurulur. */
export const MIN_CARDS_FOR_ADAPT = 3;

/** Slot sayısına göre uyarlama / deneme hedefi (deneme en az 1). */
export function briefRatioTarget(slotCount: number): { adapt: number; test: number } {
  const adapt = Math.min(Math.max(Math.round(slotCount * ADAPT_SHARE), 0), slotCount - 1);
  return { adapt, test: slotCount - adapt };
}

export interface BriefValidationContext {
  slotCount: number;
  /** Kart kimliği → okunur ad. */
  cards: ReadonlyMap<string, string>;
  /** Yön ref'i (`F1..`) → okunur ad. */
  directions: ReadonlyMap<string, string>;
  /** Geçen haftanın planı var mı (süreklilik kararı bunu izler). */
  hasLastWeek: boolean;
  /** Plan modu: `own` iken metinde "rakip" yok (verilmezse `rivals`). */
  mode?: PlanMode;
  /** Kanıt ref'i (kart kimliği / yön) → güven derecesi; düşük/orta dayanakta kesinlik sözü yasak (verilmezse denetim yok). */
  confidence?: ReadonlyMap<string, string>;
}

const norm = (text: string): string => text.trim().toLocaleLowerCase("tr-TR");

function textProblems(field: string, text: string): string[] {
  const problems: string[] = [];
  if (PANEL_JARGON.test(text)) problems.push(`${field}: panel jargonu var ("${PANEL_JARGON.exec(text)?.[0]}"): düz dille yaz`);
  for (const problem of strayNumberProblems(text)) problems.push(`${field}: ${problem}`);
  if (/[{}]/.test(text)) problems.push(`${field}: { } kullanma`);
  return problems;
}

/** Brifin sorunları ([] = temiz); her sorun modele geri verilebilecek kısa Türkçe cümledir. */
export function briefProblems(raw: RawCreativeBrief, ctx: BriefValidationContext): string[] {
  const problems: string[] = [];
  const n = ctx.slotCount;

  // ---- Slotlar
  if (raw.slots.length !== n) problems.push(`slot sayısı ${n} olmalı (${raw.slots.length} var)`);
  raw.slots.forEach((slot, index) => {
    if (slot.slotId !== slotIdOf(index)) problems.push(`${index + 1}. slotun kimliği ${slotIdOf(index)} olmalı ("${slot.slotId}" yazılmış)`);
  });

  // ---- Oran
  const adapt = raw.slots.filter((slot) => slot.decision === "adapt").length;
  const test = raw.slots.length - adapt;
  const target = briefRatioTarget(n);
  if (Math.abs(adapt - target.adapt) > 1) problems.push(`uyarlama slotu sayısı ${target.adapt} ±1 olmalı (${adapt} var)`);
  if (test < 1) problems.push("en az bir deneme slotu olmalı");

  // ---- Tek deneme değişkeni
  for (const slot of raw.slots) {
    const hasValue = (slot.testValue ?? "").trim() !== "";
    if (slot.decision === "test" && !hasValue) problems.push(`${slot.slotId}: deneme slotunda testValue (denenen değer) olmalı`);
    if (slot.decision === "adapt" && hasValue) problems.push(`${slot.slotId}: uyarlama slotunda testValue olmamalı`);
  }

  // ---- Kanıt ref'leri
  const thin = ctx.cards.size < MIN_CARDS_FOR_ADAPT;
  for (const slot of raw.slots) {
    const isCard = ctx.cards.has(slot.evidenceRef);
    if (!isCard && !ctx.directions.has(slot.evidenceRef)) problems.push(`${slot.slotId}: evidenceRef girdide yok ("${slot.evidenceRef}")`);
    else if (slot.decision === "adapt" && !isCard && !thin) problems.push(`${slot.slotId}: uyarlama slotu bir kart kimliğine dayanmalı (kartlar yeterli)`);
  }

  // ---- Sütun dağılımı
  const names = raw.pillars.map((pillar) => norm(pillar.pillar));
  if (new Set(names).size !== names.length) problems.push("sütun adları birbirinden farklı olmalı");
  const declared = raw.pillars.reduce((sum, pillar) => sum + pillar.slots, 0);
  if (declared !== n) problems.push(`sütun dağılımının toplamı ${n} olmalı (${declared} var)`);
  for (const slot of raw.slots) if (!names.includes(norm(slot.pillar))) problems.push(`${slot.slotId}: sütun "${slot.pillar}" sütun listesinde yok`);
  for (const pillar of raw.pillars) {
    const counted = raw.slots.filter((slot) => norm(slot.pillar) === norm(pillar.pillar)).length;
    if (counted !== pillar.slots) problems.push(`"${pillar.pillar}" sütunu ${pillar.slots} slot diyor, slotlarda ${counted} var`);
  }

  // ---- Süreklilik
  if (!ctx.hasLastWeek && raw.continuity.mode !== "first_week") problems.push("geçen hafta planı yok: süreklilik kararı first_week olmalı");
  if (ctx.hasLastWeek && raw.continuity.mode === "first_week") problems.push("geçen hafta planı var: süreklilik kararı continue ya da break olmalı");

  // ---- Düz dil + sayı kuralı
  problems.push(...textProblems("theme", raw.theme));
  if ((raw.theme.match(/[.!?…](\s|$)/g) ?? []).length > 1) problems.push("theme: tek cümle olmalı");
  raw.pillars.forEach((pillar, index) => problems.push(...textProblems(`pillars.${index}.pillar`, pillar.pillar)));
  problems.push(...textProblems("testVariable.value", raw.testVariable.value), ...textProblems("testVariable.why", raw.testVariable.why), ...textProblems("continuity.note", raw.continuity.note));
  for (const slot of raw.slots) problems.push(...textProblems(`${slot.slotId}.why`, slot.why), ...textProblems(`${slot.slotId}.testValue`, slot.testValue ?? ""));

  // ---- Rakipsiz hesap: metinde rakip yok
  if (ctx.mode === "own") {
    const fields: [string, string][] = [["theme", raw.theme], ["testVariable.value", raw.testVariable.value], ["testVariable.why", raw.testVariable.why], ["continuity.note", raw.continuity.note]];
    raw.pillars.forEach((pillar, index) => fields.push([`pillars.${index}.pillar`, pillar.pillar]));
    for (const slot of raw.slots) fields.push([`${slot.slotId}.why`, slot.why], [`${slot.slotId}.testValue`, slot.testValue ?? ""]);
    for (const [field, text] of fields) problems.push(...[rivalMentionProblem(field, text)].filter((p): p is string => p !== undefined));
  }

  // ---- Güven dili: dayanağı düşük/orta slotun gerekçesinde kesinlik sözü yok; hiçbir slot yüksek güvene dayanmıyorsa genel metinler de ölçülü
  if (ctx.confidence !== undefined) {
    const confidenceOf = (ref: string): string | undefined => ctx.confidence?.get(ref);
    for (const slot of raw.slots) problems.push(...[certaintyProblem(`${slot.slotId}.why`, slot.why, confidenceOf(slot.evidenceRef))].filter((p): p is string => p !== undefined));
    if (!raw.slots.some((slot) => !isHedgedConfidence(confidenceOf(slot.evidenceRef)))) {
      const general: [string, string][] = [["theme", raw.theme], ["testVariable.why", raw.testVariable.why], ["continuity.note", raw.continuity.note]];
      for (const [field, text] of general) problems.push(...[certaintyProblem(field, text, "low")].filter((p): p is string => p !== undefined));
    }
  }
  return problems;
}

/** Sorunsuz ham brifi doğrulanmış brife çevirir (oran slotlardan sayılır, kanıt etiketleri doldurulur). Önce `briefProblems` boş olmalı. */
export function finalizeBrief(raw: RawCreativeBrief, ctx: BriefValidationContext): CreativeBrief {
  const slots: BriefSlot[] = raw.slots.map((slot) => ({
    slotId: slot.slotId,
    decision: slot.decision,
    pillar: slot.pillar.trim(),
    ...(slot.decision === "test" ? { testValue: (slot.testValue ?? "").trim() } : {}),
    why: slot.why.trim(),
    evidenceRef: slot.evidenceRef,
    evidenceLabel: ctx.cards.get(slot.evidenceRef) ?? ctx.directions.get(slot.evidenceRef) ?? slot.evidenceRef,
  }));
  const adapt = slots.filter((slot) => slot.decision === "adapt").length;
  return {
    theme: raw.theme.trim(),
    pillars: raw.pillars.map((pillar) => ({ pillar: pillar.pillar.trim(), slots: pillar.slots })),
    ratio: { adapt, test: slots.length - adapt },
    testVariable: { kind: raw.testVariable.kind, value: raw.testVariable.value.trim(), why: raw.testVariable.why.trim() },
    continuity: { mode: raw.continuity.mode, note: raw.continuity.note.trim() },
    slots,
    evidenceThin: ctx.cards.size < MIN_CARDS_FOR_ADAPT,
  };
}
