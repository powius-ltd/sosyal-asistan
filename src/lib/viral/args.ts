/**
 * `npm run viral:hunt` bayrakları: `--konu=<metin>` (tekrarlanabilir; elle konu), `--apify-max=<usd>` (ücretli koşu için tavan; yoksa HİÇBİR ücretli
 * çağrı açılmaz), `--limit=<n>` (sorgu başına sonuç) ve `--dry-run` (yalnız sorgular + tahmin). Bilinmeyen bayrak hata verir (yazım hatası para harcatmasın).
 */
import { VIRAL_RESULTS_PER_QUERY, VIRAL_WEEKLY_CAP_USD } from "@/lib/viral/thresholds";

export interface ViralArgs {
  topics: string[];
  maxUsd?: number;
  limit: number;
  dryRun: boolean;
}

export const VIRAL_USAGE = `Kullanım: npm run viral:hunt -- --workspace=<id|slug|ad> [--konu=<metin> ...] [--limit=${VIRAL_RESULTS_PER_QUERY}] [--dry-run] [--apify-max=${VIRAL_WEEKLY_CAP_USD}]`;
const LIMIT_MAX = 100;

export function parseViralArgs(argv: readonly string[]): ViralArgs {
  const args: ViralArgs = { topics: [], limit: VIRAL_RESULTS_PER_QUERY, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const topic = /^--konu=(.*)$/.exec(arg);
    if (topic) {
      if (topic[1].trim() === "") throw new Error(`--konu boş olamaz. ${VIRAL_USAGE}`);
      args.topics.push(topic[1].trim());
      continue;
    }
    const max = /^--apify-max=(.*)$/.exec(arg);
    if (max) {
      const value = max[1].trim();
      const maxUsd = /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
      if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > VIRAL_WEEKLY_CAP_USD) {
        throw new Error(`--apify-max 0–${VIRAL_WEEKLY_CAP_USD} arasında bir tutar olmalı (verilen: "${value}"). ${VIRAL_USAGE}`);
      }
      args.maxUsd = maxUsd;
      continue;
    }
    const limit = /^--limit=(.*)$/.exec(arg);
    if (limit) {
      const value = limit[1].trim();
      const n = /^\d+$/.test(value) ? Number(value) : Number.NaN;
      if (!Number.isInteger(n) || n < 1 || n > LIMIT_MAX) throw new Error(`--limit 1–${LIMIT_MAX} arasında tam sayı olmalı (verilen: "${value}"). ${VIRAL_USAGE}`);
      args.limit = n;
      continue;
    }
    throw new Error(`Bilinmeyen bayrak: ${arg}. ${VIRAL_USAGE}`);
  }
  return args;
}
