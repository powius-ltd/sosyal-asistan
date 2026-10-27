/**
 * Video analizi hata türleri. Tek sınıf, sebep `kind` ile ayrılır: çağıran (`analyzeVideo`) bunu `failed` sonucuna çevirir ve
 * `failure.kind` olarak kalıcı yazar. İleti Türkçe'dir ve İMZALI CDN ADRESİ İÇERMEZ (adreste erişim belirteci vardır):
 * hata iletisine yalnız alan adı girer; beklenmeyen hata iletileri `redactUrls` ile süzülür.
 */
import "server-only";

export type VideoAnalysisErrorKind =
  // girdi
  | "invalid_input"
  // indirme
  | "invalid_url"
  | "expired_url"
  | "redirect_limit"
  | "http_error"
  | "not_video"
  | "too_large"
  | "empty_download"
  | "download_timeout"
  | "download_failed"
  // küçültme
  | "ffmpeg_missing"
  | "transcode_failed"
  // agy
  | "agy_missing"
  | "agy_timeout"
  | "agy_quota"
  | "agy_failed"
  | "invalid_output"
  // claude_frames: kare çıkarma, yerel Whisper, Claude CLI
  | "frames_failed"
  | "whisper_missing"
  | "whisper_timeout"
  | "whisper_failed"
  | "claude_missing"
  | "claude_timeout"
  | "claude_quota"
  | "claude_failed"
  // arka uç seçimi / diğer
  | "not_implemented"
  | "internal";

export class VideoAnalysisError extends Error {
  constructor(
    readonly kind: VideoAnalysisErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "VideoAnalysisError";
  }
}

export function isVideoAnalysisError(error: unknown): error is VideoAnalysisError {
  return error instanceof VideoAnalysisError;
}

const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
const UNEXPECTED_MESSAGE_MAX = 240;

/** Metindeki adresleri `[adres]` ile değiştirir (imzalı CDN adresi günlüğe/veritabanına sızmasın). */
export function redactUrls(text: string): string {
  return text.replace(URL_PATTERN, "[adres]");
}

/** Beklenmeyen hata → kalıcı yazılabilir kısa ileti (adres süzülür, uzunluk sınırlı). */
export function describeUnexpected(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactUrls(raw).replace(/\s+/g, " ").trim().slice(0, UNEXPECTED_MESSAGE_MAX) || "bilinmeyen hata";
}
