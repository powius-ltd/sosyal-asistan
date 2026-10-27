/**
 * Geçici çalışma klasörü: `os.tmpdir()/panel-video/<uuid>`. Rakip videosu DİSKTE yalnız bu klasörde, yalnız analiz süresince
 * durur (AGENTS.md: video DB'ye/Storage'a yazılmaz, işlem sonunda silinir). `withTempDir` silmeyi `finally`'de yapar: işlev hata
 * fırlatsa da klasör gider. Silme başarısız olursa (Windows'ta dosya kilidi) asıl sonucu/hatayı EZMEZ, uyarı yazar; kalan klasör
 * bir sonraki koşuda `sweepStaleTempDirs` ile temizlenir.
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const TEMP_ROOT_NAME = "panel-video";

/** Yalnız bu biçimdeki alt klasörler süpürülür (kökün içine başka bir şey konmuşsa dokunulmaz). */
const UUID_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TempDirOptions {
  /** Kök üst klasörü (varsayılan `os.tmpdir()`); testte izole klasör verilir. */
  baseDir?: string;
  newId?: () => string;
  /** Silme başarısız olursa (varsayılan: `console.warn`). */
  onCleanupError?: (dir: string, error: unknown) => void;
}

export function tempRootDir(baseDir: string = tmpdir()): string {
  return path.join(baseDir, TEMP_ROOT_NAME);
}

function removeDir(dir: string): void {
  // Windows'ta ffmpeg/agy çıkışından hemen sonra dosya kilidi kısa süre kalabilir: birkaç kez yeniden dener.
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function warnCleanup(dir: string, error: unknown): void {
  console.warn(`[video-analysis] geçici klasör silinemedi (sonraki koşuda süpürülecek): ${dir} — ${error instanceof Error ? error.message : "hata"}`);
}

/** `fn`'e yeni, boş bir klasör verir; `fn` bitince (hata dahil) klasörü siler. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>, options: TempDirOptions = {}): Promise<T> {
  const dir = path.join(tempRootDir(options.baseDir), (options.newId ?? randomUUID)());
  mkdirSync(dir, { recursive: true });
  try {
    return await fn(dir);
  } finally {
    try {
      removeDir(dir);
    } catch (error) {
      (options.onCleanupError ?? warnCleanup)(dir, error);
    }
  }
}

export interface SweepOptions {
  baseDir?: string;
  now?: () => Date;
}

export interface SweepResult {
  removed: number;
  failed: number;
}

/**
 * Çökmüş koşulardan kalan klasörleri siler: `olderThanMs`'den eski (son değişiklik zamanına göre) UUID adlı alt klasörler.
 * Toplu koşu başında çağrılır; eşik, çalışan bir analizin klasörüne dokunmayacak kadar büyük olmalı (öneri ≥ 1 saat).
 */
export function sweepStaleTempDirs(olderThanMs: number, options: SweepOptions = {}): SweepResult {
  const root = tempRootDir(options.baseDir);
  const cutoff = (options.now ?? (() => new Date()))().getTime() - olderThanMs;
  let removed = 0;
  let failed = 0;
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return { removed, failed }; // kök hiç oluşmamış: süpürülecek bir şey yok
  }
  for (const name of names) {
    if (!UUID_DIR.test(name)) continue;
    const dir = path.join(root, name);
    try {
      const stat = statSync(dir);
      if (!stat.isDirectory() || stat.mtimeMs > cutoff) continue;
      removeDir(dir);
      removed += 1;
    } catch {
      failed += 1;
    }
  }
  return { removed, failed };
}
