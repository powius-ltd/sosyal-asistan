/**
 * Kredi yetmedi: ayırma yapılmadı, iş başlamamalı. Depo hata kodu `insufficient_credits`; `available` / `requested` ekrana "daha küçük
 * kapsam" önerisi için taşınır (ayrıntı okunamadıysa undefined, 0 değil). Mock ve Supabase AYNI sınıfı fırlatır.
 */
import { RepositoryError } from "@/lib/data/repository";
import type { CreditHold } from "@/lib/domain/credits";

export class InsufficientCreditsError extends RepositoryError {
  constructor(
    /** Ayrılmak istenen kredi. */
    readonly requested: number | undefined,
    /** O anda harcanabilir kredi. */
    readonly available: number | undefined,
  ) {
    super("insufficient_credits", "Kredi yetersiz: iş başlatılmadı.");
  }
}

/** `reserve_credits` hata ayrıntısı: `available=30 requested=31`. */
export function parseInsufficientDetail(details: string | null | undefined): { available?: number; requested?: number } {
  const read = (key: string): number | undefined => {
    const match = details?.match(new RegExp(`${key}=(-?\\d+)`));
    return match ? Number(match[1]) : undefined;
  };
  return { available: read("available"), requested: read("requested") };
}

/** Ayırma hâlâ açık mı (mock ve Supabase AYNI kural): kapanmış (kesinleşmiş / bırakılmış) ayırma yeniden "ayrılmış" sayılmaz. */
export function assertHoldOpen(hold: CreditHold): CreditHold {
  if (hold.status !== "open") throw new RepositoryError("invalid_state", "Bu işlem anahtarının kredi ayırması kapanmış: yeniden ayrılamaz.");
  return hold;
}
