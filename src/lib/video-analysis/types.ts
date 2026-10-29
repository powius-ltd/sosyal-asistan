/**
 * Video analizi sözleşmesi: girdi, sonuç (D'nin kalıcı yazacağı biçim), bağımlılıklar ve arka uç arayüzü. Bu klasör DB'ye YAZMAZ;
 * sonucu `lib/intel` (D) `transcripts` + `content_analyses` + `collection_runs` (`billing 'subscription'`) satırlarına çevirir.
 *
 * Sonuç üç durumlu birleşimdir (`status`):
 *  - `ok`: analiz tamam. `evidenceVerified` true ⇔ tüm alıntılar korpusta bulundu (`evidenceReport.verified`); false ise analiz
 *    yine `ok`tur ama ekranda uyarı görünür.
 *  - `insufficient_data`: konuşma + ekran yazısı < 8 kelime (müzik/sessiz video). Transcript dönülür (`isMeaningful` false),
 *    metinden türeyen alanlar (hook, bölüm, etiket) BOŞ bırakılır; görsel ölçümler (`editMetrics`) korunur.
 *  - `failed`: indirme/küçültme/agy/şema hatası; `failure.kind` makinece okunur.
 * `evidenceVerified` yalnız `status === "ok"` iken true olabilir (DB kısıtı `content_analyses_verified_needs_ok` ile aynı).
 */
import "server-only";

import type { AnalysisBackend, AnalysisLabel, AnalysisSection, EditMetrics, EvidenceReport, HookSource } from "@/lib/domain/intel";
import type { SubprocessRunner } from "@/lib/llm/subprocess";
import type { CallStats } from "@/lib/video-analysis/agy-client";
import type { Env } from "@/lib/video-analysis/env";
import type { VideoAnalysisErrorKind } from "@/lib/video-analysis/errors";
import type { SegmentChannel } from "@/lib/video-analysis/output-schema";

/** Rakip transkriptinin ömrü (gün): sonra metin silinir, yalnız hook alıntısı + analiz kalır (kullanıcı kararı). */
export const TRANSCRIPT_RETENTION_DAYS = 90;

export interface AnalyzeVideoInput {
  /** `content_items.id` (sonuçta aynen döner). */
  contentId: string;
  /** Apify `videoUrl` (Instagram CDN, süreli). */
  videoUrl: string;
  /** Rakip içeriği mi (transcript `expiresAt` = şimdi + 90 gün; kendi içerikte süresiz). */
  isCompetitor: boolean;
  /** Gönderi açıklaması: hook/etiket kanıt korpusuna girer ve istemde VERİ olarak verilir. */
  caption?: string;
  /** Bilinen süre (sn): kesme-hızı türevleri buna göre hesaplanır; yoksa modelin bildirdiği süre. */
  durationSec?: number;
}

/** Transcript segmenti, DB `transcripts.segments` biçiminde (`start`/`end`, kanal `speech` | `screen`). */
export interface PersistedSegment {
  start: number;
  end?: number;
  text: string;
  channel: SegmentChannel;
}

/**
 * `transcripts` satırı alanları. `provider` DB'de 'gemini'dir (agy de Gemini modelidir); `claude_frames` arka ucunda 'claude_cli'
 * (konuşma metni yerel Whisper'dan gelir ama DB'de 'whisper' değeri yok; analizi yapan sağlayıcı yazılır).
 */
export interface AnalyzedTranscript {
  provider: "gemini" | "claude_cli";
  language: string;
  /** Yalnız KONUŞMA kanalının metni (segmentler sırayla, tek boşlukla); konuşma yoksa "". Ekran yazısı `segments`'te. */
  text: string;
  wordCount: number;
  segments: PersistedSegment[];
  /** Konuşma ≥ 8 kelime (`isMeaningfulSpeech`). */
  isMeaningful: boolean;
  /** Rakip içerikte createdAt + 90 gün (ISO); kendi içerikte undefined (süresiz, DB NULL). */
  expiresAt?: string;
}

/** `content_analyses` satırı alanları. */
export interface AnalysisFields {
  hookText?: string;
  hookSource?: HookSource;
  hookType?: string;
  hookTypeEvidence?: string;
  sections: AnalysisSection[];
  labels: AnalysisLabel[];
  /** Kurgu ölçümleri; ölçülemeyen alan YOK (0 ile doldurulmaz). */
  editMetrics?: EditMetrics;
  evidenceReport: EvidenceReport;
}

interface ResultBase {
  contentId: string;
  backend: AnalysisBackend;
  /** Modelin adı (`content_analyses.model`). */
  model: string;
  taxonomyVersion: string;
  promptVersion: string;
  /** Video süresi (sn): girdideki, yoksa modelin bildirdiği; bilinmiyorsa undefined. */
  durationSec?: number;
  /** Çağrı istatistiği (başarısız sonuçta da dolu: yapılan çağrılar abonelik sayacına yazılır). */
  stats: CallStats;
}

export interface OkAnalysisResult extends ResultBase {
  status: "ok";
  transcript: AnalyzedTranscript;
  analysis: AnalysisFields;
  evidenceVerified: boolean;
}

export interface InsufficientAnalysisResult extends ResultBase {
  status: "insufficient_data";
  /** `content_analyses.failure_reason` (neden yetersiz). */
  reason: string;
  transcript: AnalyzedTranscript;
  analysis: AnalysisFields;
  evidenceVerified: false;
}

export interface FailedAnalysisResult extends ResultBase {
  status: "failed";
  /** `failure.message` `content_analyses.failure_reason`'a yazılır (Türkçe, adres içermez). */
  failure: { kind: VideoAnalysisErrorKind; message: string };
  evidenceVerified: false;
}

export type VideoAnalysisResult = OkAnalysisResult | InsufficientAnalysisResult | FailedAnalysisResult;

/** Enjekte edilen bağımlılıklar (test/üretim). Varsayılanlar `resolveDeps` (`analyze-video.ts`). */
export interface AnalyzeVideoDeps {
  now: () => Date;
  fetch: typeof fetch;
  runner: SubprocessRunner;
  sleep: (ms: number) => Promise<void>;
  /** `AGY_BIN`, `AGY_MODEL`, `AGY_TIMEOUT_MS`, `FFMPEG_BIN`, `VIDEO_ANALYSIS_BACKEND`. */
  env: Env;
  /** Geçici klasörün üst klasörü (varsayılan `os.tmpdir()`; testte izole). */
  tempBaseDir?: string;
  /** Sınır geçersiz kılmaları (testte küçük değerler). */
  limits?: {
    maxDownloadBytes?: number;
    shrinkThresholdBytes?: number;
    downloadTimeoutMs?: number;
  };
}

/** Bir arka ucun kimliği: başarısız sonuçlar bile hangi arka uçla denendiğini taşır. */
export interface BackendIdentity {
  backend: AnalysisBackend;
  model: string;
}

/** İndirme sonrası adım: hazır yerel dosyayı analiz eder (hata fırlatabilir). `agy` ve `claude_frames` ayrı uygular. */
export type AnalyzeFileFn = (
  input: Omit<AnalyzeVideoInput, "videoUrl">,
  file: { dir: string; fileName: string },
  deps: AnalyzeVideoDeps,
  stats: CallStats,
) => Promise<OkAnalysisResult | InsufficientAnalysisResult>;

/** Hattın arka uca özgü kısmı (varsayılan `agy`). `shrink: false` = 480p küçültme atlanır (kare çıkaran arka uç özgün dosyayı ister). */
export interface PipelineOptions {
  identity?: BackendIdentity;
  analyzeFile?: AnalyzeFileFn;
  shrink?: boolean;
}

export interface BackendAvailability {
  available: boolean;
  version?: string;
  reason?: string;
}

/** Video analizi arka ucu: lokal `agy`, deploy'da Gemini API ya da `claude_frames` (`VIDEO_ANALYSIS_BACKEND=agy|gemini-api|claude_frames`). */
export interface VideoAnalyzer {
  readonly backend: AnalysisBackend;
  readonly model: string;
  /** Toplu koşu başında bir kez sorulur (agy: `agy --version`; model çağrısı yapmaz). */
  checkAvailable(): Promise<BackendAvailability>;
  /** Hiçbir durumda fırlatmaz (hata → `failed` sonucu); YALNIZ uygulanmamış arka uç `not_implemented` fırlatır. */
  analyze(input: AnalyzeVideoInput): Promise<VideoAnalysisResult>;
  /** Yerel dosyadan analiz (indirme yok; dosya geçici klasöre KOPYALANIR, kaynağa dokunulmaz). Tanımsız = bu arka uç yerel dosya desteklemez. */
  analyzeLocal?(input: Omit<AnalyzeVideoInput, "videoUrl">, sourcePath: string): Promise<VideoAnalysisResult>;
}
