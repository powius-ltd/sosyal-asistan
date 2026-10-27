/**
 * Bir içerikten (Video analizi) "Claude/ChatGPT'ye yapıştır" metni. SAF: aynı girdi → aynı metin; ağ/saat/depo yok.
 * Bölümler: Rol · Bağlam (niş tanımı varsa) · Kanıt (kaynak video) · Görev · Kısıtlar. Uzunluk ≤ `PROMPT_MAX_CHARS`;
 * Rol, Görev ve Kısıtlar her zaman tam kalır (`fit-prompt.ts`).
 */
import { evidenceLines } from "@/lib/prompt/evidence";
import { fitPrompt } from "@/lib/prompt/fit-prompt";
import { constraintsSection, contextSection, isVideoFormat, taskSection } from "@/lib/prompt/sections";
import { promptStrings } from "@/lib/prompt/strings";
import type { ContentPromptInput } from "@/lib/prompt/types";

export function buildContentPrompt(input: ContentPromptInput): string {
  const { video, language } = input;
  const t = promptStrings(language);
  const task = t.task.content({ isVideo: isVideoFormat(video.format) });

  return fitPrompt({
    role: [t.role],
    task: taskSection(task, t),
    constraints: constraintsSection(input.complianceRegion, language, t),
    before: () => [contextSection(input.nicheBrief, t)],
    evidence: (limits) => [
      `## ${t.headings.evidence}`,
      t.sourceNote,
      "",
      ...evidenceLines(video, t.evidence.sourceHeading(video.ownerHandle), language, limits),
    ],
  });
}
