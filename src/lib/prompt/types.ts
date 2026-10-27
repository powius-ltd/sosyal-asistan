/**
 * "Prompt olarak kopyala" girdi tipleri. Kurucular (`buildIdeaPrompt`, `buildContentPrompt`) SAFTIR: depo, saat ya da
 * ağ bilmez; veriyi sunucu aksiyonu toplar (`app/actions/prompt.ts`) ve `from-detail.ts` bu tiplere çevirir.
 *
 * Kural: ölçülemeyen alan `undefined`'dır ve prompta "bilinmiyor" diye girer, asla 0 olarak değil.
 */
import type { ComplianceRegion } from "@/lib/domain/compliance";
import type { ContentFormat, Platform, ViewsKind } from "@/lib/platforms/types";

/** Prompt (ve istenen çıktı) dilleri. İçerik İngilizce hesaplar için "en". */
export const PROMPT_LANGUAGES = ["tr", "en"] as const;

export type PromptLanguage = (typeof PROMPT_LANGUAGES)[number];

/** Transcript durumu: tam metin var, süresi doldu (yalnız hook alıntısı + analiz kaldı) ya da hiç yok/anlamsız. */
export type PromptTranscript = { state: "available"; text: string } | { state: "expired" } | { state: "none" };

/** Prompta giren tek kanıt video. */
export interface PromptVideo {
  ownerHandle: string;
  /** Kendi hesabın içeriği mi (undefined = bilinmiyor). */
  isOwn?: boolean;
  platform: Platform;
  format: ContentFormat;
  /** Ölçülemediyse undefined (0 değil). */
  views?: number;
  viewsKind?: ViewsKind;
  lift?: number;
  /** Baz çizgisi: hesabın aynı format + aynı viewsKind içindeki son içeriklerinin medyan izlenmesi. */
  baselineViews?: number;
  baselineN?: number;
  lowConfidence?: boolean;
  immature?: boolean;
  /** Lift ölçülemediyse sebep. */
  liftUnmeasuredReason?: string;
  caption?: string;
  url?: string;
  /** Transcript'ten BİREBİR hook alıntısı (yalnız kanıtı doğrulanmış analizden). */
  hookText?: string;
  /** Versiyonlu taksonomi anahtarı. */
  hookType?: string;
  sections: readonly { type: string; quote: string }[];
  transcript: PromptTranscript;
}

/** Fikir kartının prompta giren alanları. */
export interface PromptIdea {
  title: string;
  rationale: string;
  platform: Platform;
  format: ContentFormat;
  hooks: readonly string[];
  hookType?: string;
  scriptOutline: readonly string[];
}

interface PromptBase {
  /** Workspace niş tanımı; yoksa Bağlam bölümü atlanır. */
  nicheBrief?: string;
  /** Uyum hatırlatması bu bölgenin kurallarından gelir. */
  complianceRegion: ComplianceRegion;
  language: PromptLanguage;
}

export interface IdeaPromptInput extends PromptBase {
  idea: PromptIdea;
  /** Kanıt videolar (fikirde ≥ 2; prompta en çok `MAX_EVIDENCE_VIDEOS` girer). */
  evidence: readonly PromptVideo[];
}

export interface ContentPromptInput extends PromptBase {
  video: PromptVideo;
}
