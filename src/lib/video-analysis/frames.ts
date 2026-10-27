/**
 * Kare çıkarma: ffmpeg ile videodan en çok 12 küçük JPEG (uzun kenar ≤ 768). İlk 3 sn sık (açılış: 0 / 0,75 / 1,5 / 2,25 sn),
 * kalan kareler 3 sn'den sona eşit aralıkla. Her kare ayrı ffmpeg çağrısıdır (`-ss` girdiden önce: hızlı arama); kare üretmeyen
 * zaman (video sonu) atlanır, hiç kare çıkmazsa `frames_failed`. Dosyalar çağıranın geçici klasörüne yazılır (silme orada, `finally`).
 * Süre: bilinen süre yoksa `ffprobe` (`FFPROBE_BIN`) ile okunur; okunamazsa `frames_failed` (süresiz video kareleri güvenilmez).
 */
import "server-only";

import { statSync } from "node:fs";
import path from "node:path";

import { SubprocessError, type SubprocessRunner } from "@/lib/llm/subprocess";
import { envString, type Env } from "@/lib/video-analysis/env";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";
import { ffmpegBin } from "@/lib/video-analysis/transcode";

export const MAX_FRAMES = 12;
/** Açılış penceresi (sn) ve içindeki kare sayısı. */
export const OPENING_SEC = 3;
export const OPENING_FRAMES = 4;
export const FRAME_LONG_EDGE = 768;
const FRAME_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 30_000;

export interface Frame {
  fileName: string;
  /** Videodaki konum (sn). */
  timeSec: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Süreye göre kare zamanları: ilk 3 sn sık, sonrası eşit aralık; toplam ≤ `MAX_FRAMES`, sıralı, tekrarsız. */
export function planFrameTimes(durationSec: number): number[] {
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) return [0];
  const total = Math.min(MAX_FRAMES, Math.max(1, Math.ceil(durationSec * 2)));
  const times: number[] = [];
  if (durationSec <= OPENING_SEC) {
    for (let i = 0; i < total; i += 1) times.push((durationSec * i) / total);
  } else {
    const opening = Math.min(OPENING_FRAMES, total);
    for (let i = 0; i < opening; i += 1) times.push((OPENING_SEC * i) / OPENING_FRAMES);
    const rest = total - opening;
    const span = durationSec - OPENING_SEC;
    for (let i = 0; i < rest; i += 1) times.push(OPENING_SEC + (span * (i + 0.5)) / rest);
  }
  return [...new Set(times.map(round2))].slice(0, MAX_FRAMES);
}

/** Uzun kenarı en çok `FRAME_LONG_EDGE` olan, büyütmeyen ölçek süzgeci. */
export function scaleFilter(): string {
  const edge = FRAME_LONG_EDGE;
  return `scale='if(gte(iw,ih),min(${edge},iw),-2)':'if(gte(iw,ih),-2,min(${edge},ih))'`;
}

export function ffprobeBin(env: Env): string {
  return envString(env, "FFPROBE_BIN") ?? "ffprobe";
}

export async function probeDurationSec(filePath: string, deps: { runner: SubprocessRunner; env: Env }): Promise<number> {
  try {
    const result = await deps.runner({
      command: ffprobeBin(deps.env),
      args: ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const value = Number(result.stdout.trim());
    if (result.exitCode === 0 && Number.isFinite(value) && value > 0) return value;
  } catch (error) {
    if (!(error instanceof SubprocessError)) throw error;
  }
  throw new VideoAnalysisError("frames_failed", "Video süresi okunamadı (ffprobe kurulu mu? FFPROBE_BIN ile yol verilebilir).");
}

export interface ExtractFramesInput {
  /** Video dosyasının tam yolu. */
  filePath: string;
  /** Kare dosyalarının yazılacağı klasör. */
  dir: string;
  durationSec?: number;
}

export interface ExtractFramesResult {
  frames: Frame[];
  durationSec: number;
}

export async function extractFrames(input: ExtractFramesInput, deps: { runner: SubprocessRunner; env: Env }): Promise<ExtractFramesResult> {
  const durationSec = input.durationSec ?? (await probeDurationSec(input.filePath, deps));
  const times = planFrameTimes(durationSec);
  const frames: Frame[] = [];

  for (const [index, time] of times.entries()) {
    const fileName = `frame-${String(index + 1).padStart(2, "0")}.jpg`;
    const target = path.join(input.dir, fileName);
    try {
      const result = await deps.runner({
        command: ffmpegBin(deps.env),
        args: ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(time), "-i", input.filePath, "-frames:v", "1", "-vf", scaleFilter(), "-q:v", "4", target],
        timeoutMs: FRAME_TIMEOUT_MS,
      });
      if (result.exitCode !== 0) continue;
    } catch (error) {
      if (error instanceof SubprocessError && error.code === "spawn_failed") {
        throw new VideoAnalysisError("ffmpeg_missing", "ffmpeg bulunamadı: kurun ya da FFMPEG_BIN ile tam yolunu verin.");
      }
      throw error;
    }
    try {
      if (statSync(target).size > 0) frames.push({ fileName, timeSec: time });
    } catch {
      // bu zamanda kare yok (video sonu): atla
    }
  }
  if (frames.length === 0) throw new VideoAnalysisError("frames_failed", "Videodan kare çıkarılamadı.");
  return { frames, durationSec };
}
