/**
 * Prompt uzunluk bütçesi. Toplam üst sınır `PROMPT_MAX_CHARS` (kod noktası). Rol, Görev ve Kısıtlar bölümleri SABİTTİR
 * (asla kısılmaz); geri kalan bütçe değişken bölümlere (Bağlam, Fikir, Kanıt) dağıtılır. Her metin alanının kendi tavanı
 * vardır (`CAPS`); sığmazsa `FIT_STEPS` sırayla uygulanır (`fit-prompt.ts`).
 */
import { truncateText } from "@/lib/text";

/** Prompt'un toplam üst sınırı (karakter = Unicode kod noktası). */
export const PROMPT_MAX_CHARS = 6000;

/** Transcript kısaltma tavanı (tek video). */
export const TRANSCRIPT_MAX_CHARS = 1200;

/** Fikir prompt'unda en çok kaç kanıt video girer. */
export const MAX_EVIDENCE_VIDEOS = 5;

/** Alan başına tavanlar (kod noktası); alan tek satıra indirilir ve gerekirse "…" ile biter. */
export const CAPS = {
  niche: 600,
  caption: 200,
  hook: 300,
  ideaTitle: 200,
  rationale: 400,
  hookSuggestion: 200,
  scriptStep: 200,
  /** Fikirde listelenen en çok hook önerisi / script adımı. */
  hookSuggestions: 5,
  scriptSteps: 8,
} as const;

/** Sığdırma adımının kısılabilir kısımları (kanıt + fikir). */
export interface FitLimits {
  transcriptMax: number;
  sectionCount: number;
  sectionQuoteMax: number;
  /** Kanıt videonun alt yazı tavanı; 0 = alt yazı girmez. */
  captionMax: number;
  /** Fikirde listelenen hook önerisi / script adımı sayısı. */
  hookSuggestions: number;
  scriptSteps: number;
  /** Fikir prompt'unda kanıt video sayısı (üst sınır `MAX_EVIDENCE_VIDEOS`). */
  evidenceCount: number;
}

const NORMAL: FitLimits = {
  transcriptMax: TRANSCRIPT_MAX_CHARS,
  sectionCount: 6,
  sectionQuoteMax: 160,
  captionMax: CAPS.caption,
  hookSuggestions: CAPS.hookSuggestions,
  scriptSteps: CAPS.scriptSteps,
  evidenceCount: MAX_EVIDENCE_VIDEOS,
};
const NO_EXTRAS: FitLimits = { ...NORMAL, transcriptMax: 0, sectionCount: 0, sectionQuoteMax: 0 };
const NO_CAPTION: FitLimits = { ...NO_EXTRAS, captionMax: 0 };
const FEW_IDEAS: FitLimits = { ...NO_CAPTION, hookSuggestions: 1, scriptSteps: 2 };

/** En kısık hâl (`FIT_STEPS`'in son adımı): son çare kesim bunun üstünde yapılır. */
export const MINIMAL_LIMITS: FitLimits = { ...FEW_IDEAS, evidenceCount: 3 };

/**
 * Sığana dek SIRAYLA denenir (ilk adım kısıtsız hâl); her adım öncekinin üstüne biner:
 * 1) transcript → bölümler, 2) kanıt alt yazı tavanı (200 → 80 → 0), 3) hook önerisi ve script adımı sayısı,
 * 4) kanıt sayısı (5 → 3). Hepsi tükenirse son çare kesim Kanıt bölümünün içinden yapılır.
 */
export const FIT_STEPS: readonly FitLimits[] = [
  NORMAL,
  { ...NORMAL, transcriptMax: 800, sectionCount: 4, sectionQuoteMax: 120 },
  { ...NORMAL, transcriptMax: 400, sectionCount: 3, sectionQuoteMax: 100 },
  { ...NORMAL, transcriptMax: 0, sectionCount: 2, sectionQuoteMax: 80 },
  NO_EXTRAS,
  { ...NO_EXTRAS, captionMax: 80 },
  NO_CAPTION,
  { ...NO_CAPTION, hookSuggestions: 3, scriptSteps: 5 },
  FEW_IDEAS,
  MINIMAL_LIMITS,
];

/** Tek satıra indirip `max` kod noktasına keser (`truncateText`); boşsa undefined. */
export function cap(text: string | undefined, max: number): string | undefined {
  const cut = text ? truncateText(text, max) : "";
  return cut === "" ? undefined : cut;
}
