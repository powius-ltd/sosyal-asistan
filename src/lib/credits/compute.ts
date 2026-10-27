/**
 * Kredi defterinin SAF hesabı: bakiye türetme, harcama sırası, ayırmanın partilere dağıtılması, kesinleşen tutarın bölünmesi.
 * Mock depo bunlarla çalışır; Supabase aynı kuralları SQL'de uygular (migration 0017) ve bakiyeyi AYNI `balanceOf` ile parti satırlarından
 * türetir. İki uygulamanın aynı sonucu verdiğini sözleşme süiti (`data/contract/credits.ts`) sınar.
 *
 * Harcama sırası (tek kural, `spendOrder`): önce aylık kova; kova içinde süresi en yakın dolan (süresiz en sonda), sonra en eski, sonra kimlik.
 */
import type { CreditBalance, CreditLot } from "@/lib/domain/credits";

/** Partinin bir parçası: hangi partiden ne kadar. */
export interface CreditSlice {
  lotId: string;
  amount: number;
}

/** Parti şu an harcanabilir mi: süresizse ya da son kullanma anı gelmemişse (an geldiyse dolmuştur). */
export function isLotAlive(lot: Pick<CreditLot, "expiresAt">, now: Date): boolean {
  return lot.expiresAt === undefined || Date.parse(lot.expiresAt) > now.getTime();
}

const expiryMs = (lot: Pick<CreditLot, "expiresAt">): number => (lot.expiresAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(lot.expiresAt));

/** Partileri harcama sırasına dizer (yeni dizi). */
export function spendOrder<T extends Pick<CreditLot, "id" | "bucket" | "expiresAt" | "createdAt">>(lots: readonly T[]): T[] {
  return [...lots].sort(
    (a, b) =>
      Number(b.bucket === "monthly") - Number(a.bucket === "monthly") ||
      expiryMs(a) - expiryMs(b) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

/** Bakiye: süresi dolmamış partilerin serbest kalanı kovalara göre; `held` tüm açık ayırmalar (süresi sonradan dolan partidekiler dahil). */
export function balanceOf(lots: readonly CreditLot[], now: Date): CreditBalance {
  const spendable = lots.filter((lot) => lot.free > 0 && isLotAlive(lot, now));
  const sum = (bucket: CreditLot["bucket"]) => spendable.filter((lot) => lot.bucket === bucket).reduce((total, lot) => total + lot.free, 0);
  const monthly = sum("monthly");
  const purchased = sum("purchased");
  const held = lots.reduce((total, lot) => total + lot.held, 0);

  // İlk dolacak kredi: süreli partilerin en yakın anı; aynı anda dolan aynı kovadaki partiler toplanır.
  const expiring = spendable.filter((lot) => lot.expiresAt !== undefined).sort((a, b) => expiryMs(a) - expiryMs(b) || Number(b.bucket === "monthly") - Number(a.bucket === "monthly"));
  const first = expiring[0];
  const nextExpiry =
    first?.expiresAt === undefined
      ? undefined
      : {
          at: new Date(first.expiresAt).toISOString(),
          bucket: first.bucket,
          amount: expiring.filter((lot) => expiryMs(lot) === expiryMs(first) && lot.bucket === first.bucket).reduce((total, lot) => total + lot.free, 0),
        };
  return { available: monthly + purchased, monthly, purchased, held, ...(nextExpiry === undefined ? {} : { nextExpiry }) };
}

/**
 * `amount` krediyi harcama sırasıyla partilere dağıtır (yalnız süresi dolmamış partilerin serbest kalanından). Yetmezse `undefined`:
 * kısmi ayırma YOKTUR (iş ya tam ayırır ya hiç başlamaz).
 */
export function allocateCredits(lots: readonly CreditLot[], amount: number, now: Date): CreditSlice[] | undefined {
  if (!Number.isInteger(amount) || amount <= 0) return undefined;
  const slices: CreditSlice[] = [];
  let left = amount;
  for (const lot of spendOrder(lots.filter((candidate) => candidate.free > 0 && isLotAlive(candidate, now)))) {
    const take = Math.min(left, lot.free);
    slices.push({ lotId: lot.id, amount: take });
    left -= take;
    if (left === 0) return slices;
  }
  return undefined;
}

/**
 * Kesinleşen tutarı ayırmanın dağılımından düşer: `allocations` harcama sırasında verilir, baştan doldurulur (önce aylık); artan kısım
 * serbest kalır. `actual` dağılımın toplamını aşamaz (çağıran doğrular); 0 ise boş liste (düşüm satırı yazılmaz).
 */
export function splitCharge(allocations: readonly CreditSlice[], actual: number): CreditSlice[] {
  const charges: CreditSlice[] = [];
  let left = actual;
  for (const slice of allocations) {
    if (left <= 0) break;
    const take = Math.min(left, slice.amount);
    charges.push({ lotId: slice.lotId, amount: take });
    left -= take;
  }
  if (left > 0) throw new RangeError("Kesinleşen tutar ayırmanın dağılımını aşıyor.");
  return charges;
}
