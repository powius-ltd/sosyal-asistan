/**
 * `npm run collect:now` bayrakları: `--limit=<n>` (hedef başına reel sayısı), `--max-usd=<n>` (toplam harcama tavanı;
 * yalnız kullanıcı onaylı tutarla, en çok `MAX_USD_CEILING`) ve `--dry-run` (yalnız plan + tahmin).
 * Bilinmeyen bayrak sessizce yutulmaz (yazım hatası para harcatmasın): hata fırlatır.
 */
import "server-only";

import { DEFAULT_CONTENT_LIMIT, DEFAULT_MAX_USD, MAX_CONTENT_LIMIT } from "@/lib/collection/plan";

/** `--max-usd` üst sınırı: yazım hatasıyla büyük harcamayı önler. */
export const MAX_USD_CEILING = 2;

export interface CollectArgs {
  limit: number;
  maxUsd: number;
  dryRun: boolean;
}

export const COLLECT_USAGE = `Kullanım: npm run collect:now -- [--limit=${DEFAULT_CONTENT_LIMIT}] [--max-usd=${DEFAULT_MAX_USD}] [--dry-run]`;

export function parseCollectArgs(argv: readonly string[]): CollectArgs {
  const args: CollectArgs = { limit: DEFAULT_CONTENT_LIMIT, maxUsd: DEFAULT_MAX_USD, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const maxMatch = /^--max-usd=(.*)$/.exec(arg);
    if (maxMatch) {
      const value = maxMatch[1].trim();
      const maxUsd = /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
      if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > MAX_USD_CEILING) {
        throw new Error(`--max-usd 0–${MAX_USD_CEILING} arasında bir sayı olmalı (verilen: "${value}"). ${COLLECT_USAGE}`);
      }
      args.maxUsd = maxUsd;
      continue;
    }
    const match = /^--limit=(.*)$/.exec(arg);
    if (match) {
      const value = match[1].trim();
      const limit = /^\d+$/.test(value) ? Number(value) : Number.NaN;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CONTENT_LIMIT) {
        throw new Error(`--limit 1–${MAX_CONTENT_LIMIT} arasında tam sayı olmalı (verilen: "${value}"). ${COLLECT_USAGE}`);
      }
      args.limit = limit;
      continue;
    }
    throw new Error(`Bilinmeyen bayrak: ${arg}. ${COLLECT_USAGE}`);
  }
  return args;
}
