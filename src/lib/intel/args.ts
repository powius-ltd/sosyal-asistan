/**
 * Betik argümanları: `analyze:now [--pilot] [--limit=N] [--concurrency=N] [--dry-run]` ve `plan:week [--week=YYYY-MM-DD] [--dry-run]`.
 * Bilinmeyen argüman hata verir (yanlış yazılmış `--dry-run` sessizce gerçek koşuya dönmesin).
 */
import { DEFAULT_ANALYZE_LIMIT } from "@/lib/intel/analysis-select";
import { DEFAULT_CONCURRENCY } from "@/lib/intel/call-budget";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import { DAY_MS } from "@/lib/time";

export interface AnalyzeArgs {
  pilot: boolean;
  limit: number;
  dryRun: boolean;
  /** Eşzamanlı video analizi sayısı (agy kota/oran sınırı için küçük tutulur). */
  concurrency: number;
  /**
   * İsteğe bağlı kanca (panel işçisi; betikler vermez): analiz kuyruğu başlamadan ve her video BİTİNCE sorulur. `true` dönerse kalan
   * videolar BAŞLATILMAZ (yolda olanlar biter, yazılanlar kalır). Hata fırlatırsa yok sayılır.
   */
  shouldStop?: () => boolean | Promise<boolean>;
  /** İsteğe bağlı kanca (panel işçisi): kuyruk başında (0/n) ve her video bitince (i/n) çağrılır. Hata fırlatırsa yok sayılır. */
  onProgress?: (progress: { done: number; total: number }) => void | Promise<void>;
}

export const MAX_ANALYZE_LIMIT = 60;
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 6;

export function parseAnalyzeArgs(argv: readonly string[]): AnalyzeArgs {
  const args: AnalyzeArgs = { pilot: false, limit: DEFAULT_ANALYZE_LIMIT, dryRun: false, concurrency: DEFAULT_CONCURRENCY };
  for (const arg of argv) {
    if (arg === "--pilot") args.pilot = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value < 1 || value > MAX_ANALYZE_LIMIT) throw new Error(`--limit 1–${MAX_ANALYZE_LIMIT} arasında tam sayı olmalı.`);
      args.limit = value;
    } else if (arg.startsWith("--concurrency=")) {
      const raw = arg.slice("--concurrency=".length).trim();
      const value = raw === "" ? Number.NaN : Number(raw);
      if (!Number.isInteger(value) || value < MIN_CONCURRENCY || value > MAX_CONCURRENCY) throw new Error(`--concurrency ${MIN_CONCURRENCY}–${MAX_CONCURRENCY} arasında tam sayı olmalı.`);
      args.concurrency = value;
    } else throw new Error(`Bilinmeyen argüman: ${arg} (geçerli: --pilot, --limit=N, --concurrency=N, --dry-run).`);
  }
  return args;
}

export interface PlanArgs {
  /** Verilmediyse çağıran gelecek Pazartesi'yi hesaplar. */
  week?: string;
  dryRun: boolean;
}

export function parsePlanArgs(argv: readonly string[]): PlanArgs {
  const args: PlanArgs = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--week=")) {
      const week = weekStartOf(arg.slice("--week=".length).trim());
      if (week === undefined) throw new Error("--week YYYY-MM-DD biçiminde geçerli bir tarih olmalı.");
      args.week = week;
    } else throw new Error(`Bilinmeyen argüman: ${arg} (geçerli: --week=YYYY-MM-DD, --dry-run).`);
  }
  return args;
}

/** Gelecek Pazartesi (bugün Pazartesi ise bir sonraki): `todayKey` hedef kitle saat diliminde takvim günü (YYYY-MM-DD). */
export function nextMondayOf(todayKey: string): string {
  const monday = weekStartOf(todayKey);
  if (monday === undefined) throw new RangeError(`Geçersiz gün: ${todayKey}`);
  const next = new Date(Date.parse(`${monday}T00:00:00Z`) + 7 * DAY_MS);
  return next.toISOString().slice(0, 10);
}
