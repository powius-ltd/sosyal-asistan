/**
 * Küçültme: 18 MB'ı aşan video `ffmpeg` ile 480p'ye indirilir (analiz için ses + görüntü yeter; büyük dosya yükleme/zaman
 * aşımı riskidir). Çağrı `runSubprocess` (kabuksuz) ile; ikili dosya `FFMPEG_BIN` ya da PATH'teki `ffmpeg`. ffmpeg kurulu değilse
 * `ffmpeg_missing` (açık hata: sessizce atlanmaz, büyük dosya analize gitmez). Küçültülmüş dosya özgünden BÜYÜKSE özgün kalır.
 * Yükseklik 480'den küçük videoda ölçek büyütülmez (`min(480,ih)`).
 */
import "server-only";

import { statSync } from "node:fs";
import path from "node:path";

import { assertSuccess, SubprocessError, type SubprocessRunner } from "@/lib/llm/subprocess";
import { envString, type Env } from "@/lib/video-analysis/env";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";

export const SHRINK_THRESHOLD_BYTES = 18 * 1024 * 1024;
export const SHRINK_TARGET_HEIGHT = 480;
export const DEFAULT_TRANSCODE_TIMEOUT_MS = 180_000;
const SHRUNK_FILE_NAME = "video-480p.mp4";

export interface VideoFile {
  fileName: string;
  bytes: number;
}

export interface ShrinkOptions {
  dir: string;
  runner: SubprocessRunner;
  env: Env;
  thresholdBytes?: number;
  timeoutMs?: number;
}

export interface ShrinkResult extends VideoFile {
  shrunk: boolean;
}

export function ffmpegBin(env: Env): string {
  return envString(env, "FFMPEG_BIN") ?? "ffmpeg";
}

export function buildShrinkArgs(input: string, output: string): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f", // girdi biçimi açık: CDN'den gelen bayt dizisi ffmpeg'in biçim tahminine bırakılmaz (demuxer seçimi sabit)
    "mp4",
    "-i",
    input,
    "-vf",
    `scale=-2:'min(${SHRINK_TARGET_HEIGHT},ih)'`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-ac",
    "1",
    "-movflags",
    "+faststart",
    output,
  ];
}

/** Eşiği aşmıyorsa dokunmaz (ffmpeg çağrılmaz); aşıyorsa 480p kopya üretir. */
export async function shrinkVideoIfNeeded(file: VideoFile, options: ShrinkOptions): Promise<ShrinkResult> {
  const threshold = options.thresholdBytes ?? SHRINK_THRESHOLD_BYTES;
  if (file.bytes <= threshold) return { ...file, shrunk: false };

  const input = path.join(options.dir, file.fileName);
  const output = path.join(options.dir, SHRUNK_FILE_NAME);
  try {
    const result = await options.runner({
      command: ffmpegBin(options.env),
      args: buildShrinkArgs(input, output),
      cwd: options.dir,
      timeoutMs: options.timeoutMs ?? DEFAULT_TRANSCODE_TIMEOUT_MS,
    });
    assertSuccess(result, "ffmpeg");
  } catch (error) {
    if (error instanceof SubprocessError && error.code === "spawn_failed") {
      throw new VideoAnalysisError("ffmpeg_missing", "ffmpeg bulunamadı: kurun ya da FFMPEG_BIN ile tam yolunu verin.");
    }
    if (error instanceof SubprocessError) throw new VideoAnalysisError("transcode_failed", `Video küçültülemedi: ${error.message}`);
    throw error;
  }

  let shrunkBytes: number;
  try {
    shrunkBytes = statSync(output).size;
  } catch {
    throw new VideoAnalysisError("transcode_failed", "Video küçültülemedi: ffmpeg çıktı dosyası üretmedi.");
  }
  if (shrunkBytes === 0) throw new VideoAnalysisError("transcode_failed", "Video küçültülemedi: çıktı dosyası boş.");
  if (shrunkBytes >= file.bytes) return { ...file, shrunk: false };
  return { fileName: SHRUNK_FILE_NAME, bytes: shrunkBytes, shrunk: true };
}
