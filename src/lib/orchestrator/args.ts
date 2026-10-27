/**
 * `npm run rutin` bayrakları: `--dry-run` (hiçbir LLM/Apify/yazma yok; yalnız durum + adım kararları), `--apify-max=<usd>` (Apify onayı ve
 * toplam harcama tavanı; verilmezse toplama ASLA koşmaz), `--concurrency=N` (eşzamanlı video analizi). Bilinmeyen bayrak hata verir:
 * yazım hatası para harcatmasın ya da kuru koşuyu gerçeğe çevirmesin.
 */
import { MAX_USD_CEILING } from "@/lib/collection/parse-args";
import { MAX_CONCURRENCY, MIN_CONCURRENCY } from "@/lib/intel/args";
import { DEFAULT_CONCURRENCY } from "@/lib/intel/call-budget";

export interface RoutineArgs {
  dryRun: boolean;
  /** Onaylı Apify tavanı (USD); undefined = onay yok. */
  apifyMaxUsd?: number;
  concurrency: number;
}

export const ROUTINE_USAGE = `Kullanım: npm run rutin -- [--dry-run] [--apify-max=<usd>] [--concurrency=${DEFAULT_CONCURRENCY}] [--workspace=<id|slug|ad> | --all]`;

export function parseRoutineArgs(argv: readonly string[]): RoutineArgs {
  const args: RoutineArgs = { dryRun: false, concurrency: DEFAULT_CONCURRENCY };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const apify = /^--apify-max=(.*)$/.exec(arg);
    if (apify) {
      const value = apify[1].trim();
      const usd = /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
      if (!Number.isFinite(usd) || usd <= 0 || usd > MAX_USD_CEILING) {
        throw new Error(`--apify-max 0–${MAX_USD_CEILING} arasında bir USD tutarı olmalı (verilen: "${value}"). ${ROUTINE_USAGE}`);
      }
      args.apifyMaxUsd = usd;
      continue;
    }
    const concurrency = /^--concurrency=(.*)$/.exec(arg);
    if (concurrency) {
      const value = concurrency[1].trim();
      const n = /^\d+$/.test(value) ? Number(value) : Number.NaN;
      if (!Number.isInteger(n) || n < MIN_CONCURRENCY || n > MAX_CONCURRENCY) {
        throw new Error(`--concurrency ${MIN_CONCURRENCY}–${MAX_CONCURRENCY} arasında tam sayı olmalı (verilen: "${value}"). ${ROUTINE_USAGE}`);
      }
      args.concurrency = n;
      continue;
    }
    throw new Error(`Bilinmeyen bayrak: ${arg}. ${ROUTINE_USAGE}`);
  }
  return args;
}
