/**
 * `npm run measure:now` bayrakları: `--dry-run` (yalnız tahmin; para harcanmaz) ve `--max-usd=<n>` (tek seferlik harcama onayı).
 * Bilinmeyen bayrak sessizce yutulmaz (yazım hatası para harcatmasın): hata fırlatır.
 */
import "server-only";

import { MAX_USD_CEILING } from "@/lib/collection/parse-args";

export interface MeasureArgs {
  dryRun: boolean;
  /** Tek seferlik onay; verilmediyse undefined (aylık ölçüm tavanı belirleyici olur). */
  maxUsd?: number;
}

export const MEASURE_USAGE = `Kullanım: npm run measure:now -- [--dry-run] [--max-usd=0.05]  (harcama yalnız --max-usd ya da onaylı aylık ölçüm tavanıyla)`;

export function parseMeasureArgs(argv: readonly string[]): MeasureArgs {
  const args: MeasureArgs = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const match = /^--max-usd=(.*)$/.exec(arg);
    if (match) {
      const value = match[1].trim();
      const maxUsd = /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
      if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > MAX_USD_CEILING) {
        throw new Error(`--max-usd 0–${MAX_USD_CEILING} arasında bir sayı olmalı (verilen: "${value}"). ${MEASURE_USAGE}`);
      }
      args.maxUsd = maxUsd;
      continue;
    }
    throw new Error(`Bilinmeyen bayrak: ${arg}. ${MEASURE_USAGE}`);
  }
  return args;
}
