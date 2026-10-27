/**
 * Hesap baz çizgisi (deterministik, LLM yok).
 *
 * baz çizgisi = hesabın aynı format VE aynı viewsKind içindeki en yeni `window` (25)
 * içeriğinin views medyanı. Hariç: hedefin kendisi, `isPinned === true`, views'ı ölçülemeyen,
 * yayın tarihi bilinmeyen ve `minAgeDays`'ten (3 gün) yeni olanlar. n < `minN` (10) → düşük güven.
 */
import { DAY_MS, isValidDate } from "@/lib/metrics/dates";
import { median } from "@/lib/metrics/stats";
import type {
  BaselineBasisEntry,
  BaselineExcluded,
  BaselineResult,
  ScorableItem,
} from "@/lib/metrics/types";

export const BASELINE_DEFAULTS = { window: 25, minAgeDays: 3, minN: 10 } as const;

export interface BaselineOptions {
  /** Referans an. Verilmezse şimdiki zaman (testlerde ve toplu hesapta her zaman verin). */
  now?: Date;
  window?: number;
  minAgeDays?: number;
  minN?: number;
}

/** Yayından bu yana `minAgeDays` günden az geçti mi? (Gelecek tarihli içerik de genç sayılır.) */
export function isYoung(
  publishedAt: Date,
  now: Date,
  minAgeDays: number = BASELINE_DEFAULTS.minAgeDays,
): boolean {
  return now.getTime() - publishedAt.getTime() < minAgeDays * DAY_MS;
}

/** İçerik baz çizgisine girer mi? Girerse kayıt, girmezse ilk takıldığı kural döner. */
function classify(
  it: ScorableItem,
  target: ScorableItem,
  now: Date,
  minAgeDays: number,
): keyof BaselineExcluded | BaselineBasisEntry {
  if (it.id === target.id) return "self";
  if (it.format !== target.format) return "otherFormat";
  if (it.isPinned === true) return "pinned";
  // Negatif ya da sonlu olmayan izlenme geçersiz veridir (ölçülemedi sayılır); baz çizgisi medyanını bozmasın.
  if (it.views === undefined || !Number.isFinite(it.views) || !(it.views >= 0)) return "noViews";
  if (it.viewsKind === undefined || it.viewsKind !== target.viewsKind) return "otherKind";
  if (!isValidDate(it.publishedAt)) return "noDate";
  if (isYoung(it.publishedAt, now, minAgeDays)) return "young";
  return { id: it.id, views: it.views, publishedAt: it.publishedAt };
}

/** Yeniden eskiye; aynı anda yayınlananlar id'ye göre (girdi sırasından bağımsız, deterministik). */
function newestFirst(a: BaselineBasisEntry, b: BaselineBasisEntry): number {
  const byDate = b.publishedAt.getTime() - a.publishedAt.getTime();
  if (byDate !== 0) return byDate;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function accountBaseline(
  all: readonly ScorableItem[],
  target: ScorableItem,
  o: BaselineOptions = {},
): BaselineResult {
  const now = o.now ?? new Date();
  const windowSize = o.window ?? BASELINE_DEFAULTS.window;
  const minAgeDays = o.minAgeDays ?? BASELINE_DEFAULTS.minAgeDays;
  const minN = o.minN ?? BASELINE_DEFAULTS.minN;

  const excluded: BaselineExcluded = {
    self: 0,
    otherFormat: 0,
    pinned: 0,
    noViews: 0,
    otherKind: 0,
    noDate: 0,
    young: 0,
  };
  const eligible: BaselineBasisEntry[] = [];
  for (const it of all) {
    const c = classify(it, target, now, minAgeDays);
    if (typeof c === "string") excluded[c] += 1;
    else eligible.push(c);
  }

  const basis = eligible.sort(newestFirst).slice(0, Math.max(0, windowSize));
  const n = basis.length;
  return {
    median: median(basis.map((b) => b.views)),
    n,
    lowConfidence: n < minN,
    basis,
    excluded,
  };
}
