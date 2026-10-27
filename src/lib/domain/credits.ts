/**
 * Kredi defteri (Dilim 2; plan `docs/KREDI-PLAN.md` §4, §6). Şema: migration 0017 (`credit_accounts`, `credit_ledger`, `credit_holds`,
 * `credit_hold_allocations`, görünüm `credit_lots`). İş akışına BAĞLI DEĞİLDİR: hiçbir iş kendiliğinden kredi ayırmaz / düşmez (Dilim 3).
 *
 * Kurallar:
 *  - Bakiye SAKLANMAZ, türetilir: kullanılabilir = Σ süresi dolmamış partilerin kalanı − Σ açık ayırma (`lib/credits/compute.ts`).
 *  - Defter yalnız eklenir (güncelleme / silme yok); düzeltme yeni satırla yapılır.
 *  - Kredi KULLANICIYA aittir: tüm çalışma alanları tek bakiyeden yer; satır hangi çalışma alanı için harcandığını taşır.
 *  - İki kova: aylık kredi dönem sonunda yanar, ek kredi 12 ay geçerlidir; ÖNCE AYLIK harcanır.
 *  - Ayır → kesinleştir: iş başlamadan en çok tutar ayrılır; bitince gerçekleşen kadar düşülür, fark serbest kalır. Eksi bakiye yoktur.
 *  - Her yazma idempotenttir: aynı anahtarla ikinci çağrı ilk sonucu döndürür (çift düşüm / çift verme olmaz).
 *  - Ölçülemeyen `undefined`'dır (0 değil): kesinleşmemiş ayırmanın `charged`'ı, süresiz partinin `expiresAt`'i yoktur.
 * Yeni hareket türü / kova / ayırma durumu = bu listeler + migration CHECK'leri BİRLİKTE (`credits.test.ts` SQL ile karşılaştırır).
 * Saf dosya (sunucu + istemci). Fiyatlar `credit-pricing.ts`'te, müşteri metni `plain-language.ts`'te (Dilim 4).
 */
import type { CreditItem } from "@/lib/domain/credit-pricing";

/** Defter hareket türleri (`credit_ledger.entry_type`). */
export const CREDIT_ENTRY_TYPES = ["grant_monthly", "purchase", "charge", "refund", "expire", "adjust"] as const;
export type CreditEntryType = (typeof CREDIT_ENTRY_TYPES)[number];

/** `grantCredits` ile verilebilen türler (hepsi yeni parti açar): aylık paket kredisi · ek satın alma · elle düzeltme / başlangıç bakiyesi. */
export const CREDIT_GRANT_TYPES = ["grant_monthly", "purchase", "adjust"] as const;
export type CreditGrantType = (typeof CREDIT_GRANT_TYPES)[number];

/** Kovalar: `monthly` dönem sonunda yanar, `purchased` ek satın alınan kredidir. Harcama sırası: önce `monthly`. */
export const CREDIT_BUCKETS = ["monthly", "purchased"] as const;
export type CreditBucket = (typeof CREDIT_BUCKETS)[number];

export const CREDIT_HOLD_STATUSES = ["open", "settled", "released"] as const;
export type CreditHoldStatus = (typeof CREDIT_HOLD_STATUSES)[number];

/** Tek ayırmanın / vermenin üst sınırları (girdi doğrulaması; yanlış bir sıfır fazlalığı defteri kirletmesin). */
export const CREDIT_HOLD_MAX = 100_000;
export const CREDIT_GRANT_MAX = 1_000_000;
/** İdempotency anahtarı biçimi (`credit_holds.idempotency_key` CHECK'i ile aynı). İş için iş kimliği, sohbette koşu kimliği. */
export const CREDIT_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
export const CREDIT_NOTE_MAX_CHARS = 200;
/** Ek kredinin ömrü (süre verilmezse): 12 ay. */
export const CREDIT_PURCHASE_VALID_MONTHS = 12;

/**
 * Düşülen birim sayıları: kalem → adet (`{ video_review: 7, briefing: 1 }`). Fiyat tablosunun sürümüyle birlikte saklanır; tutar bu ikisinden
 * yeniden hesaplanabilir. `type` takma adıdır (jsonb sütununa `Json` olarak atanabilsin).
 */
export type CreditChargeUnits = Partial<Record<CreditItem, number>>;

/**
 * Bir kredi partisi: verilen miktar ve ondan geriye kalan. `remaining` defterdeki net (verilen − düşülen), `held` açık ayırmaların bu partiden
 * tuttuğu, `free = remaining − held` harcanabilir kalandır. Süresi dolmuş partinin `free`'si bakiyeye girmez.
 */
export interface CreditLot {
  id: string;
  bucket: CreditBucket;
  granted: number;
  remaining: number;
  held: number;
  free: number;
  /** Son kullanma anı (ISO). undefined = süresiz. */
  expiresAt?: string;
  createdAt: string;
}

/** Türetilmiş bakiye. Hesabı olmayan (hiç kredi verilmemiş) kullanıcıda hepsi 0'dır: bu bilinen bir sıfırdır. */
export interface CreditBalance {
  /** Şu an harcanabilir kredi: süresi dolmamış partilerin serbest kalanı (açık ayırmalar düşülmüş). `monthly + purchased`. */
  available: number;
  /** `available`'ın aylık kovadaki kısmı (önce bu harcanır). */
  monthly: number;
  /** `available`'ın ek kredi kovasındaki kısmı. */
  purchased: number;
  /** Açık ayırmaların tuttuğu kredi (süren işler). */
  held: number;
  /** İlk dolacak kredi: an + o anda yanacak serbest miktar. Süreli ve serbest kredisi olan parti yoksa undefined. */
  nextExpiry?: { at: string; amount: number; bucket: CreditBucket };
}

/** Defter satırı. `amount` işaretlidir: artı = kredi girdi, eksi = kredi çıktı. */
export interface CreditEntry {
  id: string;
  type: CreditEntryType;
  amount: number;
  bucket: CreditBucket;
  /** Bu satırın işlediği parti; parti açan satırda (verme) undefined. */
  lotId?: string;
  /** Yalnız parti açan satırda: partinin son kullanma anı (undefined = süresiz). */
  expiresAt?: string;
  /** Hangi çalışma alanı için (kayıt silindiyse ya da çalışma alanına bağlı değilse undefined). */
  workspaceId?: string;
  panelJobId?: string;
  runId?: string;
  /** Düşümü doğuran ayırma. Aynı ayırmanın satırları AYNI `units`'i taşır (rapor `holdId` ile tekilleştirir). */
  holdId?: string;
  units?: CreditChargeUnits;
  /** Düşümde kullanılan fiyat tablosu sürümü (`CREDIT_PRICE_VERSION`). */
  priceVersion?: string;
  note?: string;
  createdAt: string;
}

/** Kredi ayırması: iş başlamadan tutulan en çok tutar. */
export interface CreditHold {
  id: string;
  /** İdempotency anahtarı (çağıranın verdiği). */
  key: string;
  /** Ayrılan en çok tutar. */
  amount: number;
  status: CreditHoldStatus;
  /** Kesinleşen (düşülen) tutar. undefined = kesinleşmedi (0 değil); 0 = kesinleşti, hiç düşülmedi. */
  charged?: number;
  workspaceId?: string;
  panelJobId?: string;
  runId?: string;
  units?: CreditChargeUnits;
  priceVersion?: string;
  createdAt: string;
  /** Kesinleşme / bırakma anı; açık ayırmada undefined. */
  closedAt?: string;
}

/** Türün yazıldığı kova: aylık kredi `monthly`, ek satın alma `purchased`; düzeltmede çağıran seçer (varsayılan `purchased`). */
export function bucketOfGrant(type: CreditGrantType, bucket?: CreditBucket): CreditBucket {
  if (type === "grant_monthly") return "monthly";
  if (type === "purchase") return "purchased";
  return bucket ?? "purchased";
}
