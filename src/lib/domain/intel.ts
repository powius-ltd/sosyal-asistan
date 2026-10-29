/**
 * Zeka katmanı alan tipleri: transcript, içerik analizi, fikir kartı.
 * Tablolar: `transcripts`, `content_analyses`, `ideas` + `idea_evidence` (PLAN.md "Veri modeli").
 *
 * Kural: enum'lar versiyonlu taksonomiden gelir (`taxonomyVersion`); bu yüzden
 * `hookType`, bölüm tipi ve etiket anahtarları `string`'tir (sözlükler `domain/hook-types.ts`, `domain/taxonomy.ts`;
 * LLM tarafı `lib/llm/taxonomy.ts`). Her etiket/hook birebir kanıt alıntısı taşır ve alıntı transkript/ekran yazısı/
 * açıklama korpusunda aranarak doğrulanır (`evidenceVerified`, `evidenceReport`; kural `lib/intel/evidence.ts`).
 */
import type { ScriptReview } from "@/lib/domain/script-review";
import type { ContentSummary } from "@/lib/domain/content-summary";
import type { IdeaReelLink } from "@/lib/domain/idea-link";
import type { IdeaRevision } from "@/lib/domain/idea-revision";
import type { CtaType, DurationBucket, IdeaFrame } from "@/lib/domain/taxonomy";
import type { ContentFormat, Platform } from "@/lib/platforms/types";
import { truncateText } from "@/lib/text";

/**
 * Geçerli taksonomi sürümü: hook türleri (`domain/hook-types.ts`), bölüm tipleri, etiket eksenleri, CTA türleri ve süre
 * kovaları (`domain/taxonomy.ts`) bu sürüme aittir. Analiz/plan/ses profili satırları bunu `taxonomy_version` olarak saklar;
 * liste değişirse sürüm artar (eski satırlar eski sürümle okunur).
 */
export const TAXONOMY_VERSION = "2026-10-v1";

/** Transkriptin "anlamlı" sayılması için en az kelime sayısı (altı: müzik/sessiz → `insufficient_data`). */
export const MIN_MEANINGFUL_WORDS = 8;

// ---------------------------------------------------------------- Transcript

export type TranscriptSource = "apify" | "deepgram" | "openai_stt" | "gemini" | "claude_cli" | "manual";

/** Transcript kanalı: videoda SÖYLENEN (konuşma) ya da ekrana BASILAN yazı (başlık kartı, üst yazı, CTA). */
export type TranscriptChannel = "speech" | "screen";

/** Zaman sıralı transcript parçası (`transcripts.segments`). */
export interface TranscriptSegment {
  startSec: number;
  endSec?: number;
  text: string;
  channel: TranscriptChannel;
}

export interface Transcript {
  id: string;
  contentItemId: string;
  language?: string;
  /**
   * Tam metin. `expiresAt` geçince silinir (undefined); geriye yalnız hook
   * alıntısı + analiz kalır. Süresi dolmuş transcript'i UI "süresi doldu" diye gösterir.
   */
  text?: string;
  /**
   * Zaman sıralı parçalar, kanal ayrımıyla (konuşma + ekran yazısı): `text` yalnız konuşmadır, ekran yazısının tam dökümü
   * burada. Eski/segmentsiz transcript'te ve süresi dolunca (`text` ile birlikte silinir) undefined.
   */
  segments?: TranscriptSegment[];
  wordCount: number;
  /** ≥ 8 kelime. Anlamlı değilse (müzik/sessiz) analiz `insufficient_data` olur. */
  isMeaningful: boolean;
  source: TranscriptSource;
  /** createdAt + 90 gün (rakip transcript'i). undefined = süresiz (kendi içeriğin transcript'i; DB `expires_at` NULL). */
  expiresAt?: string;
  createdAt: string;
}

// ------------------------------------------------------------------- Analiz

export type AnalysisStatus = "ok" | "failed" | "insufficient_data";

export interface AnalysisSection {
  /** Taksonomiden bölüm tipi (ör. "hook", "problem", "value", "cta"). */
  type: string;
  /** Transcript'ten birebir alıntı. */
  quote: string;
  startSec?: number;
}

export interface AnalysisLabel {
  /** Taksonomi ekseni (ör. "topic", "tone"). */
  key: string;
  value: string;
  /** Etiketi doğrulayan birebir alıntı. */
  evidence: string;
}

/** Hook'un geldiği kanal: konuşulan ilk cümle, ekrandaki yazı ya da açıklama (`content_analyses.hook_source`). */
export type HookSource = "speech" | "screen_text" | "caption";

export const HOOK_SOURCES: readonly HookSource[] = ["speech", "screen_text", "caption"];

export const HOOK_SOURCE_LABEL: Record<HookSource, string> = {
  speech: "Konuşma",
  screen_text: "Ekran yazısı",
  caption: "Açıklama",
};

/** Video analizi arka ucu: `agy` (lokal CLI) | `gemini-api` (deploy) | `claude_frames` (kareler + yerel Whisper → Claude CLI). */
export type AnalysisBackend = "agy" | "gemini-api" | "claude_frames";

export const ANALYSIS_BACKENDS: readonly AnalysisBackend[] = ["agy", "gemini-api", "claude_frames"];

export type EditTempo = "slow" | "medium" | "fast";
export type EditTextPosition = "top" | "middle" | "bottom";
export type EditLayout = "full" | "split" | "screen_recording";
export type EditOpeningVisual = "face" | "product" | "screen" | "broll";

export const EDIT_TEMPO_LABEL: Record<EditTempo, string> = { slow: "Yavaş", medium: "Orta", fast: "Hızlı" };

/**
 * Kurgu ölçümleri (video analizi; `content_analyses.edit_metrics`). Hepsi isteğe bağlıdır: ölçülemeyen alan yazılmaz
 * (`undefined ≠ 0`). Amaç kurgu ↔ lift ilişkisini görmek (F2 "kurgu ölçümleri × lift").
 */
export interface EditMetrics {
  /** Toplam kesme (plan değişimi) sayısı. */
  cutCount?: number;
  /** Ortalama plan süresi (sn). */
  avgShotSec?: number;
  /** Dakikadaki kesme sayısı (tempo ölçüsü). */
  cutsPerMinute?: number;
  tempo?: EditTempo;
  /** Ekrana basılan yazı (overlay/altyazı dışı başlık) sayısı. */
  onScreenTextCount?: number;
  /** Konuşmacı kamerada mı. */
  onCameraSpeaker?: boolean;
  hasMusic?: boolean;
  /** Konuşma yazıya dökülmüş (yakılmış altyazı) mı. */
  hasBurnedCaptions?: boolean;
  // Stüdyo sipariş fişinin istediği biçim alanları (09; `video-analysis-2026-10-v2` ve sonrası, eski analizlerde undefined).
  /** İlk 3 saniyedeki kesme sayısı. */
  cutsInFirst3Sec?: number;
  /** Ekran yazısının dikey konumu. */
  textPosition?: EditTextPosition;
  /** Ekran yazısının en çok satır sayısı. */
  textLines?: number;
  /** Kare yerleşimi: tam ekran, bölünmüş ya da ekran kaydı. */
  layout?: EditLayout;
  /** Açılış karesinde ne var. */
  openingVisual?: EditOpeningVisual;
}

/** Sunucunun alıntı denetiminde neyin denetlendiği. */
export type EvidenceTarget = "hook" | "hook_type" | "section" | "label";

/** Bir alıntının aranabileceği kanallar (korpus = konuşma ∪ ekran yazısı ∪ açıklama). */
export type EvidenceChannel = "speech" | "screen_text" | "caption";

/**
 * Alıntı neden doğrulanamadı: boş · çok kısa (< 2 kelime: "the" gibi alıntı her yerde bulunur, kanıt olmaz) · çok uzun (hook ≤ 200
 * karakter) · korpusta yok · hook konuşmanın ilk %25'inde değil.
 */
export type EvidenceFailure = "empty" | "too_short" | "too_long" | "not_found" | "outside_first_quarter";

export interface EvidenceCheck {
  target: EvidenceTarget;
  /** Bölüm tipi ya da etiket anahtarı (hook/hook_type için yok). */
  key?: string;
  /** Denetlenen alıntı (birebir aday). */
  quote: string;
  found: boolean;
  /** Bulunduğu kanal (found ise). */
  channel?: EvidenceChannel;
  failure?: EvidenceFailure;
}

/**
 * Alıntı denetim raporu (`content_analyses.evidence_report`; kural `lib/intel/evidence.ts`). Rapor küçük kalır: başarılı
 * denetimler sayıyla özetlenir, yalnız BAŞARISIZLAR ayrıntılıdır. Not: aynı model transkripti ve alıntıyı ürettiği için bu
 * bir öz-tutarlılık denetimidir, bağımsız doğrulama değil (bkz. docs/FAZ2-PLAN.md §3).
 */
export interface EvidenceReport {
  /** Tüm denetimler geçti mi (`ContentAnalysis.evidenceVerified` ile aynı). */
  verified: boolean;
  /** Konuşma + ekran yazısı kelime sayısı (açıklama sayılmaz: video içeriğinin kendisi). */
  corpusWords: number;
  /** `corpusWords < MIN_MEANINGFUL_WORDS`: analiz `insufficient_data` olmalı. */
  insufficientData: boolean;
  /** Hook'un doğrulandığı kanal; doğrulanamadıysa undefined. */
  hookChannel?: EvidenceChannel;
  checked: number;
  passed: number;
  failures: EvidenceCheck[];
}

export interface ContentAnalysis {
  id: string;
  contentItemId: string;
  status: AnalysisStatus;
  /** status=failed ise sebep; insufficient_data ise neden yetersiz. */
  failureReason?: string;
  /** İlk cümle/hook — kaynaktan BİREBİR (`hookSource`). */
  hookText?: string;
  /** Hook'un geldiği kanal (konuşma / ekran yazısı / açıklama). Eski analizlerde undefined. */
  hookSource?: HookSource;
  /** Taksonomiden hook türü. */
  hookType?: string;
  /** Hook türünü doğrulayan birebir alıntı. */
  hookTypeEvidence?: string;
  sections: AnalysisSection[];
  labels: AnalysisLabel[];
  /** Kurgu ölçümleri; ölçülmediyse undefined. */
  editMetrics?: EditMetrics;
  /** Tüm alıntılar korpusta bulundu mu. false ise UI uyarı gösterir. */
  evidenceVerified: boolean;
  /** Alıntı denetiminin ayrıntısı (eski analizlerde undefined). */
  evidenceReport?: EvidenceReport;
  taxonomyVersion: string;
  promptVersion: string;
  model?: string;
  /** Analizi yapan arka uç (`agy` | `gemini-api`); eski analizlerde undefined. */
  backend?: AnalysisBackend;
  /** Analizi üreten koşu (`collection_runs.id`; abonelik çağrı sayacı). */
  runId?: string;
  createdAt: string;
}

/**
 * Konu eleği sonucu (`content_topic_screens`; LLM görevi `screen-topics`): içerik niş içi mi, konusu ne. İçerik başına GÜNCEL sonuç
 * (yeniden eleme üzerine yazar). Niş dışı içerik (`inNiche = false`) karşılaştırma/plan gruplarına girmez. Satırın YOKLUĞU "elenmedi"
 * demektir ve niş içi sayılmaz: metni olmayan (açıklama ve transcript boş) içerik elenemez, o da satır üretmez.
 */
export interface ContentTopicScreen {
  contentItemId: string;
  inNiche: boolean;
  /** Kısa Türkçe konu etiketi (≤ 80 karakter); niş dışı içerikte de yazılır. */
  topic?: string;
  /** Kararı veren somut sözleri gösteren tek cümle (≤ 300 karakter). */
  reason?: string;
  promptVersion: string;
  model?: string;
  /** Elemeyi üreten koşu (`collection_runs.id`; abonelik çağrı sayacı). */
  runId?: string;
  screenedAt: string;
}

// -------------------------------------------------------------------- Fikir

export type IdeaStatus = "new" | "saved" | "scripted" | "scheduled" | "published" | "dismissed";

export const IDEA_STATUSES: readonly IdeaStatus[] = [
  "new",
  "saved",
  "scripted",
  "scheduled",
  "published",
  "dismissed",
];

/**
 * İzin verilen kullanıcı geçişleri (sunucu doğrular; UI yalnız geçerli düğmeleri gösterir).
 * `published` uç durumdur; `dismissed` yalnız geri alınabilir (→ new).
 */
export const IDEA_TRANSITIONS: Record<IdeaStatus, readonly IdeaStatus[]> = {
  new: ["saved", "scripted", "dismissed"],
  saved: ["scripted", "dismissed"],
  scripted: ["saved", "scheduled", "dismissed"],
  scheduled: ["scripted", "published", "dismissed"],
  published: [],
  dismissed: ["new"],
};

export function canTransitionIdea(from: IdeaStatus, to: IdeaStatus): boolean {
  return IDEA_TRANSITIONS[from].includes(to);
}

/** Kanıt özetindeki alt yazı üst sınırı (kod noktası; kesilirse "…" ile biter). */
export const EVIDENCE_CAPTION_MAX = 140;

/** Kanıt özeti için alt yazı: ilk dolu satır, en çok `EVIDENCE_CAPTION_MAX` kod noktası; alt yazı yoksa undefined. */
export function evidenceCaption(caption: string | undefined): string | undefined {
  const firstLine = caption?.split(/\r?\n/).find((line) => line.trim() !== "");
  return firstLine ? truncateText(firstLine, EVIDENCE_CAPTION_MAX) : undefined;
}

/**
 * Fikri destekleyen kanıt video (≥2 olmalı). Kanıt içeriğin ÖZETİNİ taşır (`ContentSummary`): fikir listesi kanıt
 * başına içerik okumasın (N+1). Özet, deponun fikri okuduğu anda içerikten türettiği görünümdür (Supabase:
 * `idea_evidence` ⨝ `content_items`); `currentLift` fikir üretildiği andaki değil GÜNCEL lift'tir.
 */
export interface IdeaEvidence extends ContentSummary {
  /** Fikir üretildiği andaki lift (sonradan değişse de kanıt sabit kalır). undefined = ölçülemedi (0 DEĞİL; DB `lift_at_creation` NULL). */
  liftAtCreation?: number;
}

/** generated: fikir üretimi · weekly_plan: haftalık plan üretimi · manual: elle eklendi (`ideas.source`). */
export type IdeaSource = "generated" | "weekly_plan" | "manual";

export const IDEA_SOURCES: readonly IdeaSource[] = ["generated", "weekly_plan", "manual"];

/** Fikir/plan içindeki kısa rakip alıntısının üst sınırı (kod noktası). */
export const RIVAL_QUOTE_MAX = 200;

/**
 * Bir rakip videosundan KISA alıntı (kullanıcı kararı, 2026-09-30: fikir kartı/plan içindeki kısa rakip alıntıları KALICIDIR).
 * Transkript 90 günde silinir (`Transcript.expiresAt`) ama bu alıntı fikirde/planda kalır; tam metin değil, en çok `RIVAL_QUOTE_MAX`
 * karakterlik bir parçadır ve alıntı üretildiği anda korpusta birebir doğrulanmıştır.
 */
export interface RivalQuote {
  contentItemId: string;
  /** Alıntının sahibi ("@" yok). */
  ownerHandle?: string;
  text: string;
}

/**
 * Kendi videosundan KISA alıntı: fikirdeki kişisel anlatımın (yer, olay, geçmiş) dayanağı. `RivalQuote` ile aynı biçim; fark
 * kaynağıdır (kendi hesabın içeriği) ve üretim anında kendi korpusunda birebir doğrulanmıştır.
 */
export type PersonalQuote = RivalQuote;

/**
 * Fikir kartının ayrıntıları (`ideas.details`): tümü isteğe bağlı; eski/elle eklenen fikirde boştur (`{}`). Script kendi
 * ses profiliyle yazılır (`lib/llm` `generate-ideas`), kopya denetimi kod tarafındadır (rakip alıntısıyla ≥ 8 kelimelik ortak dizi yasak).
 */
export interface IdeaDetails {
  /** Konu (taksonomi `topic` ekseni ya da küme adı). */
  topic?: string;
  frame?: IdeaFrame;
  ctaType?: CtaType;
  /** Hedef süre (sn) ve kovası. */
  targetDurationSec?: number;
  durationBucket?: DurationBucket;
  /** Ses profilinde yazılmış tam konuşma metni (içerik dilinde). */
  script?: string;
  scriptLanguage?: string;
  /** Açıklama (caption) taslağı. */
  captionDraft?: string;
  /** `Idea.hooks` ile AYNI sırada hook türleri (taksonomi anahtarı). */
  hookTypes?: string[];
  /** Kalıcı kısa rakip alıntıları (bkz. `RivalQuote`). */
  quotes?: RivalQuote[];
  /**
   * Script kişisel anlatım (yer, olay, geçmiş) kullanıyorsa dayanağı olan KENDİ alıntıları; doluysa yayından önce hesap sahibinin
   * onayı gerekir (`generate-ideas-validate.ts` notu). Kişisel anlatımı olmayan fikirde undefined.
   */
  personalQuotes?: PersonalQuote[];
  /** Scripti destekleyen doğrulanmış ses özellikleri (`VoiceTrait.key`). */
  voiceTraitKeys?: string[];
  /** Kendi hesap bu yönü daha önce denedi mi (false = yenilik payı 1,5). */
  ownTried?: boolean;
  /** Rakip alıntılarıyla en uzun ortak kelime dizisi; ≥ 8 ise kopya sayılır ve fikir yayınlanmaz. */
  maxSharedWords?: number;
  /** Senaryo editörü + olgu kontrolü sonucu (yalnız plana giren fikirlerde; tur çalışmadıysa ya da başarısızsa yok). */
  scriptReview?: ScriptReview;
  revisions?: IdeaRevision[];
}

// Senaryo editörü (`script-review.ts`) ve Reels bağı (`idea-link.ts`) tipleri 400 satır sınırı yüzünden ayrı dosyada; buradan da erişilir.
export { SCRIPT_CLAIM_VERDICTS } from "@/lib/domain/script-review";
export type { ScriptClaim, ScriptClaimVerdict, ScriptReview } from "@/lib/domain/script-review";

export { canConfirmIdeaLink, IDEA_LINK_ORIGINS, IDEA_LINK_STATUSES } from "@/lib/domain/idea-link";
export type { IdeaLinkOrigin, IdeaLinkStatus, IdeaReelLink } from "@/lib/domain/idea-link";

/** Fikrin bağlı olduğu haftalık plan (Fikirler plan rozeti). `position` undefined = plana girmedi, aday. */
export interface IdeaPlanLink {
  planId: string;
  /** Planın haftası (Pazartesi, YYYY-MM-DD). */
  weekStart: string;
  position?: number;
}

export interface Idea {
  id: string;
  workspaceId: string;
  status: IdeaStatus;
  title: string;
  /** "Neden bu?" — kısa gerekçe. */
  rationale: string;
  platform: Platform;
  format: ContentFormat;
  /** Nereden geldi (fikir üretimi / haftalık plan / elle). */
  source: IdeaSource;
  /** 3–5 hook önerisi. */
  hooks: string[];
  /**
   * Fikrin ana hook türü (versiyonlu taksonomi anahtarı; `hookTypeLabel` ile gösterilir). Kanıt videoların
   * analizlerinden depo çıkarır; çıkarılamadıysa undefined (ekranda "belirsiz", 0/boş değil).
   */
  hookType?: string;
  /** Script taslağı: her madde bir sahne/adım. */
  scriptOutline: string[];
  /** Ayrıntılar (script, açıklama taslağı, alıntılar …); yoksa `{}`. */
  details: IdeaDetails;
  /** Sıralama puanı: lift × yenilik × kendi başarılı içeriğe benzerlik. */
  rankScore: number;
  /**
   * Fikrin hizmet ettiği plan yönü (`F1..`, `focusDirectionRef`; bağlı planın `focus.directions` sırası). Fikir bir yöne bağlı
   * değilse (eski kayıt, elle fikir ya da model yön seçmedi) undefined: konu yönü hükmü o zaman "eşleştirilemedi" der.
   */
  directionRef?: string;
  evidence: IdeaEvidence[];
  /** Bağlı yayın işi (scheduled/published durumlarında). */
  publishJobId?: string;
  /** Bağlı haftalık plan (varsa). */
  weeklyPlan?: IdeaPlanLink;
  /** Aktif Reels bağı (onaylı ya da içerik bekleyen); yoksa undefined. Öneriler `listIdeaLinks`'te. */
  reelLink?: IdeaReelLink;
  createdAt: string;
  updatedAt: string;
}
