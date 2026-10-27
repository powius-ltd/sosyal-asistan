/**
 * Maliyet göstergesinin TEK hesabı: harcanan / rezerve / tavan / yüzde. Genel bakış maliyet kartı ve Ayarlar
 * sayacı aynı yardımcıyı kullanır, bu yüzden aynı `CostBucket` için ikisi de aynı şeyi gösterir.
 *
 * Kurallar (`undefined ≠ 0`):
 *  - Harcanan = mutabık (gerçek tutarı bilinen) koşuların toplamı. Hiçbir koşu mutabık değilse harcanan
 *    BİLİNMİYOR → `spentUsd` undefined ("—" + sebep), 0 yazılmaz. Hiç koşu yoksa harcanan gerçekten 0'dır.
 *  - Rezerve = tavana sayılan (Σ max(gerçek, rezerve)) tutarın henüz gerçek tutara dönmemiş kısmı.
 *  - Tavan: tanımsız (`none`) · 0 = harcama kapalı (`closed`: yeni koşu başlamaz) · pozitif (`set`).
 *    Yüzde yalnız pozitif tavanda (`ratio`); tavan 0'da oran tanımsızdır (0'a bölme).
 */
import type { CostBucket } from "@/lib/domain/run";

export type CapState = "none" | "closed" | "set";
/** ok: <%80 · warn: ≥%80 · over: ≥%100. */
export type CapLevel = "ok" | "warn" | "over";

export const CAP_WARN_RATIO = 0.8;

export const SPENT_UNKNOWN_REASON = "Hiçbir koşunun gerçek tutarı henüz belli değil; yalnız rezerve tutar var.";
export const CAP_NONE_REASON = "Aylık tavan tanımlı değil.";
export const CAP_CLOSED_LABEL = "Harcama kapalı";
export const CAP_CLOSED_NOTE = "Tavan $0 olduğu için harcama kapalı: yeni koşu başlatılmaz.";

export interface CostView {
  capState: CapState;
  /** none → undefined; closed → 0; set → pozitif tavan. */
  capUsd?: number;
  /** Tavana sayılan tutar (Σ max(gerçek, rezerve)). */
  committedUsd: number;
  /** Mutabık gerçek harcama; hiçbir koşu mutabık değilse undefined (0 değil). */
  spentUsd?: number;
  /** Tavandan ayrılmış ama gerçek tutara dönmemiş pay (≥ 0). */
  reservedUsd: number;
  /** committed / tavan; yalnız `capState === "set"`. */
  ratio?: number;
  level: CapLevel;
}

export function costView(bucket: CostBucket): CostView {
  const { capUsd, committedUsd, actualUsd, runs, unreconciledRuns } = bucket;
  const capState: CapState = capUsd === undefined ? "none" : capUsd > 0 ? "set" : "closed";
  const ratio = capState === "set" ? committedUsd / (capUsd as number) : undefined;
  // Koşu var ama hiçbiri mutabık değil → harcanan bilinmiyor.
  const nothingReconciled = runs > 0 && unreconciledRuns >= runs;
  return {
    capState,
    capUsd,
    committedUsd,
    spentUsd: nothingReconciled ? undefined : actualUsd,
    reservedUsd: Math.max(committedUsd - actualUsd, 0),
    ratio,
    level: ratio === undefined ? "ok" : ratio >= 1 ? "over" : ratio >= CAP_WARN_RATIO ? "warn" : "ok",
  };
}
