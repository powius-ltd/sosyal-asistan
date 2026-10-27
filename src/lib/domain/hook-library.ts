/**
 * Hook kütüphanesi: analizlerden türetilen aranabilir "hook" görünümü (swipe file). Ayrı tablo YOKTUR: giriş,
 * `content_analyses` ⨝ `content_items` görünümüdür (F2'de analizler dolunca dolar; PLAN.md "Ek özellikler").
 *
 * Kapsam: yalnız `ok` ve kanıtları doğrulanmış (`evidenceVerified`) analizler; hook metni transcript'ten BİREBİR alıntıdır
 * (transcript süresi dolsa da alıntı kalır, PLAN.md 90 gün kuralı). Sahibi kendi hesap ya da İZLENEN (`tracked`) rakip;
 * yoksayılan/aday/gizli rakip girişi kirletmez (Tutanlar ile aynı kural).
 */
import type { LiftTier } from "@/lib/domain/content";
import type { HookSource } from "@/lib/domain/intel";
import type { Platform } from "@/lib/platforms/types";

export interface HookLibraryEntry {
  /** İçerik (`/video/[id]`). */
  contentId: string;
  /** Hook cümlesi: transcript'ten birebir alıntı. */
  hookText: string;
  /** Hook'un geldiği kanal (konuşma / ekran yazısı / açıklama); eski analizde kaydedilmemişse undefined. */
  hookSource?: HookSource;
  /** Versiyonlu taksonomiden hook türü (`hookTypeLabel` ile gösterilir). */
  hookType: string;
  /** Hook türünü doğrulayan birebir alıntı. */
  hookTypeEvidence?: string;
  /** İçeriğin sahibi ("@" yok). */
  ownerHandle: string;
  platform: Platform;
  /** Kendi hesabın içeriği mi (false = rakip). */
  isOwn: boolean;
  /** İçeriğin güncel lift'i; hesaplanamadıysa undefined (0 değil). */
  lift?: number;
  liftTier?: LiftTier;
  /** Transcript dili (ISO kodu); bilinmiyorsa undefined. */
  language?: string;
  publishedAt?: string;
}

/** Hook türü başına özet (`hookTypeStats`). */
export interface HookTypeStat {
  hookType: string;
  /** Kütüphanedeki giriş sayısı. */
  count: number;
  /** Lift'i ölçülmüş girişlerin medyan lift'i (`lib/metrics` medyanı); hiçbirinin lift'i yoksa undefined (0 değil). */
  medianLift?: number;
}
