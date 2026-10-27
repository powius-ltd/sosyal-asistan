/**
 * Bir fikir kartından "Claude/ChatGPT'ye yapıştır" metni. SAF: aynı girdi → aynı metin; ağ/saat/depo yok.
 * Bölümler: Rol · Bağlam (niş tanımı varsa) · Fikir · Kanıt (kanıt videolar listesi) · Görev · Kısıtlar. Uzunluk ≤
 * `PROMPT_MAX_CHARS`; Rol, Görev ve Kısıtlar her zaman tam kalır, sığmazsa değişken bölümler sırayla kısılır (`fit-prompt.ts`).
 */
import { evidenceLines } from "@/lib/prompt/evidence";
import { fitPrompt } from "@/lib/prompt/fit-prompt";
import { MAX_EVIDENCE_VIDEOS } from "@/lib/prompt/limits";
import {
  constraintsSection,
  contextSection,
  ideaSection,
  isVideoFormat,
  taskSection,
} from "@/lib/prompt/sections";
import { promptStrings } from "@/lib/prompt/strings";
import type { IdeaPromptInput } from "@/lib/prompt/types";

export function buildIdeaPrompt(input: IdeaPromptInput): string {
  const { idea, language } = input;
  const t = promptStrings(language);
  const task = t.task.idea({ isVideo: isVideoFormat(idea.format) });

  return fitPrompt({
    role: [t.role],
    task: taskSection(task, t),
    constraints: constraintsSection(input.complianceRegion, language, t),
    before: (limits) => [contextSection(input.nicheBrief, t), ideaSection(idea, t, limits)],
    evidence: (limits) => [
      `## ${t.headings.evidence}`,
      t.sourceNote,
      ...input.evidence.slice(0, Math.min(MAX_EVIDENCE_VIDEOS, limits.evidenceCount)).flatMap((video, i) => [
        "",
        ...evidenceLines(video, t.evidence.itemHeading(i + 1, video.ownerHandle), language, limits),
      ]),
    ],
  });
}
