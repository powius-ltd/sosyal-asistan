/**
 * İşin kredi sayacı (saf): iş açılırken AYRILAN krediye karşı yapılan birimleri sayar. Koşturucular bir adımı başlatmadan önce "sığar mı"
 * diye sorar (`canAfford` / `affordable`), birim tamamlanınca ekler (`add`); iş kapanırken yapılanın tutarı (`due`) deftere düşülür.
 *
 * Kurallar: yalnız TAMAMLANAN birim eklenir (başarısız video / hesap sayılmaz) · tutar ayrılanı AŞAMAZ (`due` ayrılanla sınırlıdır; aşım
 * `overrun` ile bildirilir, günlüğe yazılır) · kredi yüzünden başlatılmayan adım / video varsa `markExhausted` (iş `partial` kapanır).
 * Krediye bağlı olmayan işte (zorlama kapalı, önizleme, kredi harcamayan tür) `unboundMeter` kullanılır: her şey sığar, hiçbir şey düşülmez.
 */
import { CREDIT_UNIT_PRICES, type CreditItem } from "@/lib/domain/credit-pricing";
import type { CreditChargeUnits } from "@/lib/domain/credits";
import { chargeOf } from "@/lib/domain/job-credits";

export interface CreditMeter {
  /** İş krediye bağlı mı (ayırması var mı). */
  readonly bound: boolean;
  /** İş açılırken ayrılan kredi; bağlı değilse 0. */
  readonly reserved: number;
  /** Tamamlanan birimi ekler (0 ve negatif sayı eklenmez). */
  add(item: CreditItem, count: number): void;
  /** Sayılan birimler (kalem → adet). */
  units(): CreditChargeUnits;
  /** Düşülecek tutar: yapılanın tutarı, ayrılanla sınırlı. */
  due(): number;
  /** Yapılanın tutarı ayrılanı ne kadar aştı (0 = aşmadı). */
  overrun(): number;
  /** Ayrılandan kalan kredi (bağlı değilse sonsuz). */
  remaining(): number;
  /** `count` birim kalan krediye sığar mı. */
  canAfford(item: CreditItem, count?: number): boolean;
  /** Kalan krediye sığan en çok birim (`max`'ı aşmaz). */
  affordable(item: CreditItem, max: number): number;
  /** Kredi yetmediği için bir adım / video başlatılmadı. */
  markExhausted(): void;
  exhausted(): boolean;
}

function meter(reserved: number | undefined): CreditMeter {
  const counted: CreditChargeUnits = {};
  let exhausted = false;
  const bound = reserved !== undefined;
  const spent = () => chargeOf(counted);
  const remaining = () => (reserved === undefined ? Number.POSITIVE_INFINITY : Math.max(0, reserved - spent()));
  return {
    bound,
    reserved: reserved ?? 0,
    add(item, count) {
      if (!bound || !Number.isInteger(count) || count <= 0) return;
      counted[item] = (counted[item] ?? 0) + count;
    },
    units: () => ({ ...counted }),
    due: () => (reserved === undefined ? 0 : Math.min(spent(), reserved)),
    overrun: () => (reserved === undefined ? 0 : Math.max(0, spent() - reserved)),
    remaining,
    canAfford: (item, count = 1) => count * CREDIT_UNIT_PRICES[item] <= remaining(),
    affordable: (item, max) => (reserved === undefined ? max : Math.max(0, Math.min(max, Math.floor(remaining() / CREDIT_UNIT_PRICES[item])))),
    markExhausted() {
      if (bound) exhausted = true;
    },
    exhausted: () => exhausted,
  };
}

/** Krediye bağlı işin sayacı: `reserved` iş açılırken ayrılan kredidir. */
export const createCreditMeter = (reserved: number): CreditMeter => meter(reserved);
/** Krediye bağlı OLMAYAN işin sayacı: her şey sığar, hiçbir şey sayılmaz. */
export const unboundMeter = (): CreditMeter => meter(undefined);
