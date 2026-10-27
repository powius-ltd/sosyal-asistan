/** Planın başındaki kreatif direktör brifi bölümü (saf metin; `plan-markdown.ts` ilk bölüm olarak ekler). */
import {
  CONTINUITY_LABEL,
  slotDecisionLabel,
  TEST_VARIABLE_LABEL,
  type CreativeBrief,
} from "@/lib/llm/creative-brief-schema";

export function briefMarkdown(brief: CreativeBrief): string[] {
  const lines = [
    "",
    "## 0. Haftanın brifi",
    "",
    `**Tema:** ${brief.theme}`,
    "",
    `**Sütunlar:** ${brief.pillars.map((p) => `${p.pillar} (${p.slots} slot)`).join(" · ")}`,
    `**Oran:** ${brief.ratio.adapt} ${brief.evidenceThin ? "uyarlama" : "kanıtlanmış fikir uyarlaması"} + ${brief.ratio.test} deneme`,
    `**Bu haftanın denemesi (${TEST_VARIABLE_LABEL[brief.testVariable.kind]}):** ${brief.testVariable.value} — ${brief.testVariable.why}`,
    `**Süreklilik (${CONTINUITY_LABEL[brief.continuity.mode]}):** ${brief.continuity.note}`,
  ];
  if (brief.evidenceThin) lines.push("", "_Kanıt az: kanıtlanmış fikir kartı sayısı yetersizdi; uyarlama slotları yönler ve kendi tutanlarla dolduruldu._");
  lines.push("", "**Slotlar**");
  for (const slot of brief.slots) {
    const test = slot.testValue === undefined ? "" : ` — denenen: ${slot.testValue}`;
    lines.push(`- ${slot.slotId} · ${slotDecisionLabel(slot)} · ${slot.pillar}${test} — ${slot.why} (dayanak: ${slot.evidenceLabel})`);
  }
  return lines;
}
