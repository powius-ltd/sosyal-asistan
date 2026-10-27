/**
 * Prompt'u `max` kod noktasına sığdırır. Rol, Görev ve Kısıtlar SABİTTİR: önce bunlar kurulur ve asla kısılmaz (Kısıtlar
 * uyum hatırlatmasını taşır; kesilirse kullanıcı ibaresiz içerik üretir). Kalan bütçe değişken bölümlere (Bağlam, Fikir,
 * Kanıt) verilir: `FIT_STEPS` sırayla denenir; hiçbiri sığmazsa son çare kesim KANIT bölümünün içinden yapılır.
 */
import { FIT_STEPS, MINIMAL_LIMITS, PROMPT_MAX_CHARS, type FitLimits } from "@/lib/prompt/limits";
import { composePrompt } from "@/lib/prompt/sections";

/** Prompt'un bölüm düzeni. Sıra: Rol · `before` (Bağlam, Fikir…) · Kanıt · Görev · Kısıtlar. */
export interface PromptLayout {
  /** Sabit bölümler: asla kısılmaz. */
  role: readonly string[];
  task: readonly string[];
  constraints: readonly string[];
  /** Kanıttan önceki değişken bölümler (boş bölüm undefined/[] olabilir). */
  before: (limits: FitLimits) => readonly (readonly string[] | undefined)[];
  /** Kanıt bölümünün satırları (başlık dahil). */
  evidence: (limits: FitLimits) => readonly string[];
}

/** Bölümler arası ayırıcı (`composePrompt` boş satır kullanır). */
const SEPARATOR_LENGTH = "\n\n".length;

/** Kanıt bölümüne bundan az yer kalırsa kesmeye değmez (başlığı bile sığmaz): sabit kısım tek başına sınırı aşıyor demektir. */
const MIN_EVIDENCE_ROOM = 12;

const length = (text: string) => Array.from(text).length;

function render(layout: PromptLayout, limits: FitLimits, evidence: readonly string[]): string {
  return composePrompt([layout.role, ...layout.before(limits), evidence, layout.task, layout.constraints]);
}

export function fitPrompt(layout: PromptLayout, max: number = PROMPT_MAX_CHARS): string {
  if (max < 1) return "";

  for (const limits of FIT_STEPS) {
    const text = render(layout, limits, layout.evidence(limits));
    if (length(text) <= max) return text;
  }

  // Son çare: en kısık adımda bile sığmadı → fazlalık Kanıt bölümünün İÇİNDEN kesilir (sabit bölümlere dokunulmaz).
  const last = MINIMAL_LIMITS;
  const withoutEvidence = render(layout, last, []);
  const room = max - length(withoutEvidence) - SEPARATOR_LENGTH;
  if (room >= MIN_EVIDENCE_ROOM) {
    const cut = Array.from(layout.evidence(last).join("\n")).slice(0, room - 1).join("").trimEnd();
    return render(layout, last, [`${cut}…`]);
  }

  // Sabit bölümler tek başına sınıra sığmıyor (yalnız olağan dışı küçük `max`; PROMPT_MAX_CHARS'ta erişilmez): sınırı yine de tut.
  return length(withoutEvidence) <= max ? withoutEvidence : `${Array.from(withoutEvidence).slice(0, max - 1).join("").trimEnd()}…`;
}
