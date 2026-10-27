/**
 * Prompt bölümleri (Bağlam, Fikir, Görev, Kısıtlar) ve birleştirici. Kanıt bölümü `evidence.ts`'tedir. Her bölüm
 * satır dizisidir; `composePrompt` bölümleri boş satırla ayırıp tek metne çevirir.
 */
import type { ComplianceRegion } from "@/lib/domain/compliance";
import type { ContentFormat } from "@/lib/platforms/types";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { complianceReminderLines } from "@/lib/prompt/compliance";
import { cap, CAPS, type FitLimits } from "@/lib/prompt/limits";
import { quoteUntrusted } from "@/lib/prompt/quote";
import type { PromptStrings, TaskText } from "@/lib/prompt/strings";
import type { PromptIdea, PromptLanguage } from "@/lib/prompt/types";

/** Script yazılabilen (zamanlı) biçimler; görsel/karusel için kart kart metin istenir. */
export function isVideoFormat(format: ContentFormat): boolean {
  return format === "short_video" || format === "long_video" || format === "story";
}

/** Bölümleri boş satırla ayırıp birleştirir; boş bölüm (undefined/[]) atlanır. */
export function composePrompt(blocks: readonly (readonly string[] | undefined)[]): string {
  return blocks
    .filter((block): block is readonly string[] => block !== undefined && block.length > 0)
    .map((block) => block.join("\n"))
    .join("\n\n");
}

/** Bağlam: niş tanımı; yoksa (ya da boşsa) bölüm atlanır. */
export function contextSection(nicheBrief: string | undefined, t: PromptStrings): string[] | undefined {
  const niche = cap(nicheBrief, CAPS.niche);
  return niche ? [`## ${t.headings.context}`, t.niche(niche)] : undefined;
}

/**
 * Fikir kartı özeti (yalnız fikir prompt'unda). Fikir metinleri (başlık, gerekçe, hook önerileri, script adımları)
 * kanıt videolardan türetilmiş olabilir, yani GÜVENİLMEZ: tek satırda ve tırnak içinde girer, bölümün başında bunun kaynak
 * veri olduğu (talimat olmadığı) söylenir. Hook/script sayısı `limits` ile kısılabilir.
 */
export function ideaSection(
  idea: PromptIdea,
  t: PromptStrings,
  limits: Pick<FitLimits, "hookSuggestions" | "scriptSteps"> = CAPS,
): string[] {
  const hooks = idea.hooks.slice(0, limits.hookSuggestions).flatMap((hook) => cap(hook, CAPS.hookSuggestion) ?? []);
  const steps = idea.scriptOutline.slice(0, limits.scriptSteps).flatMap((step) => cap(step, CAPS.scriptStep) ?? []);
  const numbered = (items: string[]) => items.map((item, i) => `  ${i + 1}. ${quoteUntrusted(item)}`);
  const field = (text: string | undefined) => (text ? quoteUntrusted(text) : t.unknown);

  return [
    `## ${t.headings.idea}`,
    t.sourceNote,
    `- ${t.idea.title}: ${field(cap(idea.title, CAPS.ideaTitle))}`,
    `- ${t.idea.rationale}: ${field(cap(idea.rationale, CAPS.rationale))}`,
    `- ${t.idea.platformFormat}: ${PLATFORM_LABEL[idea.platform]} · ${t.formatLabel[idea.format]}`,
    `- ${t.idea.hookType}: ${idea.hookType ? t.hookTypeLabel(idea.hookType) : t.unknown}`,
    ...(hooks.length > 0 ? [`- ${t.idea.hooks}:`, ...numbered(hooks)] : []),
    ...(steps.length > 0 ? [`- ${t.idea.script}:`, ...numbered(steps)] : []),
  ];
}

/** Görev: numaralı adımlar, kopyalama-değil-uyarla notu ve çıktı dili. */
export function taskSection(task: TaskText, t: PromptStrings): string[] {
  return [`## ${t.headings.task}`, ...task.steps.map((step, i) => `${i + 1}. ${step}`), task.note, t.task.outputLanguage];
}

/** Kısıtlar: genel kurallar + bölgeye göre uyum hatırlatması (`lib/compliance` kurallarından). */
export function constraintsSection(
  region: ComplianceRegion,
  language: PromptLanguage,
  t: PromptStrings,
): string[] {
  return [
    `## ${t.headings.constraints}`,
    `- ${t.constraints.noCopy}`,
    `- ${t.constraints.noInvention}`,
    ...complianceReminderLines(region, language),
  ];
}
