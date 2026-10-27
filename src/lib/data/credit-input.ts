/**
 * Kredi defteri girdilerinin doğrulaması — TEK tanım (`workspace-patch.ts` / `job-input.ts` deseni). Mock depo, Supabase deposu ve sunucu
 * işlevleri (`lib/credits/ledger.ts`) aynı şemayı kullanır; DB kısıtları (migration 0017) aynı kuralların ikinci savunma hattıdır.
 * Şemalar KATIDIR (`strictObject`): bilinmeyen alan hiçbir yoldan girdiye sızamaz. Hesap sahibi girdiden GELMEZ: depo bağlamından okunur.
 */
import { z } from "zod";

import { parseOrThrow } from "@/lib/data/parse-input";
import { CREDIT_ITEMS, type CreditItem } from "@/lib/domain/credit-pricing";
import {
  CREDIT_BUCKETS,
  CREDIT_ENTRY_TYPES,
  CREDIT_GRANT_MAX,
  CREDIT_GRANT_TYPES,
  CREDIT_HOLD_MAX,
  CREDIT_KEY_PATTERN,
  CREDIT_NOTE_MAX_CHARS,
  bucketOfGrant,
  type CreditBucket,
  type CreditChargeUnits,
  type CreditEntryType,
  type CreditGrantType,
} from "@/lib/domain/credits";

export interface ReserveCreditsInput {
  /** Ayrılacak EN ÇOK kredi (pozitif tam sayı). */
  amount: number;
  /** İdempotency anahtarı: iş için iş kimliği, sohbette koşu kimliği. */
  key: string;
  panelJobId?: string;
  runId?: string;
}

export interface SettleCreditsInput {
  key: string;
  /** Gerçekleşen kredi (0 ≤ gerçekleşen ≤ ayrılan). */
  actual: number;
  units?: CreditChargeUnits;
  /** Düşümde kullanılan fiyat tablosu sürümü (`CREDIT_PRICE_VERSION`). */
  priceVersion?: string;
}

export interface GrantCreditsInput {
  type: CreditGrantType;
  amount: number;
  /** İdempotency anahtarı: ödeme / dönem kimliği (aynı anahtar ikinci kez vermez). */
  key: string;
  /** Yalnız `adjust`'ta seçilir (varsayılan `purchased`); diğer türlerde türün kovasıyla aynı olmalı. */
  bucket?: CreditBucket;
  /** Son kullanma anı (ISO). `grant_monthly`'de ZORUNLU (dönem sonu); `purchase`'ta verilmezse 12 ay; `adjust`'ta verilmezse süresiz. */
  expiresAt?: string;
  workspaceId?: string;
  note?: string;
}

/** `listCreditEntries`: yeniden eskiye. `onlyWorkspace`: yalnız bu çalışma alanı için yazılan satırlar. `limit` varsayılan 50, üst sınır 200. */
export interface CreditEntryFilter {
  types?: CreditEntryType[];
  onlyWorkspace?: boolean;
  limit?: number;
}

const strict = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject(shape, { error: (issue) => (issue.code === "unrecognized_keys" ? "Kredi işleminde geçersiz bir alan gönderildi." : undefined) });

const KEY_MESSAGE = "İşlem anahtarı 1–120 karakter olmalı (harf, rakam, nokta, alt çizgi, iki nokta, tire).";
const keyField = z.string({ error: KEY_MESSAGE }).regex(CREDIT_KEY_PATTERN, KEY_MESSAGE);
const amountField = (max: number, message: string) => z.number({ error: message }).int(message).min(1, message).max(max, message);
const linkField = z.string({ error: "Bağlı kayıt kimliği metin olmalı." }).trim().min(1, "Bağlı kayıt kimliği boş olamaz.").max(80, "Bağlı kayıt kimliği çok uzun.");
const count = z.number({ error: "Birim sayısı tam sayı olmalı." }).int("Birim sayısı tam sayı olmalı.").nonnegative("Birim sayısı negatif olamaz.");

/** Düşülen birim sayıları: yalnız fiyat tablosundaki kalemler (`CREDIT_ITEMS`), her biri negatif olmayan tam sayı. */
export const creditUnitsSchema: z.ZodType<CreditChargeUnits> = strict(
  Object.fromEntries(CREDIT_ITEMS.map((item) => [item, count.optional()])) as Record<CreditItem, z.ZodOptional<typeof count>>,
);

const HOLD_MESSAGE = `Ayrılacak kredi 1 ile ${CREDIT_HOLD_MAX} arasında tam sayı olmalı.`;
export const reserveCreditsSchema: z.ZodType<ReserveCreditsInput> = strict({
  amount: amountField(CREDIT_HOLD_MAX, HOLD_MESSAGE),
  key: keyField,
  panelJobId: linkField.optional(),
  runId: linkField.optional(),
});

const ACTUAL_MESSAGE = `Gerçekleşen kredi 0 ile ${CREDIT_HOLD_MAX} arasında tam sayı olmalı.`;
export const settleCreditsSchema: z.ZodType<SettleCreditsInput> = strict({
  key: keyField,
  actual: z.number({ error: ACTUAL_MESSAGE }).int(ACTUAL_MESSAGE).min(0, ACTUAL_MESSAGE).max(CREDIT_HOLD_MAX, ACTUAL_MESSAGE),
  units: creditUnitsSchema.optional(),
  priceVersion: z.string({ error: "Fiyat sürümü metin olmalı." }).trim().min(1, "Fiyat sürümü boş olamaz.").max(40, "Fiyat sürümü çok uzun.").optional(),
});

const GRANT_MESSAGE = `Verilecek kredi 1 ile ${CREDIT_GRANT_MAX} arasında tam sayı olmalı.`;
export const grantCreditsSchema: z.ZodType<GrantCreditsInput> = strict({
  type: z.enum(CREDIT_GRANT_TYPES, { error: "Kredi verme türü geçersiz." }),
  amount: amountField(CREDIT_GRANT_MAX, GRANT_MESSAGE),
  key: keyField,
  bucket: z.enum(CREDIT_BUCKETS, { error: "Kova geçersiz." }).optional(),
  expiresAt: z
    .string({ error: "Son kullanma anı metin olmalı." })
    .refine((value) => !Number.isNaN(Date.parse(value)), "Son kullanma anı geçerli bir tarih olmalı.")
    .optional(),
  workspaceId: linkField.optional(),
  note: z.string({ error: "Not metin olmalı." }).trim().max(CREDIT_NOTE_MAX_CHARS, `Not en çok ${CREDIT_NOTE_MAX_CHARS} karakter olabilir.`).optional(),
})
  .refine((input) => input.type !== "grant_monthly" || input.expiresAt !== undefined, "Aylık kredi dönem sonu (son kullanma anı) ister.")
  .refine((input) => input.bucket === undefined || input.bucket === bucketOfGrant(input.type, input.bucket), "Bu kredi türü bu kovaya yazılamaz.");

export const creditEntryFilterSchema: z.ZodType<CreditEntryFilter> = strict({
  types: z.array(z.enum(CREDIT_ENTRY_TYPES, { error: "Hareket türü geçersiz." })).optional(),
  onlyWorkspace: z.boolean({ error: "Çalışma alanı süzgeci geçersiz." }).optional(),
  limit: z.number({ error: "Sayfa boyutu sayı olmalı." }).optional(),
});

export const parseReserveCreditsInput = (input: unknown): ReserveCreditsInput => parseOrThrow(reserveCreditsSchema, input, "Kredi ayırma isteği geçersiz.");
export const parseSettleCreditsInput = (input: unknown): SettleCreditsInput => parseOrThrow(settleCreditsSchema, input, "Kredi kesinleştirme isteği geçersiz.");
export const parseGrantCreditsInput = (input: unknown): GrantCreditsInput => parseOrThrow(grantCreditsSchema, input, "Kredi verme isteği geçersiz.");
export const parseCreditEntryFilter = (input: unknown): CreditEntryFilter => parseOrThrow(creditEntryFilterSchema, input ?? {}, "Hareket süzgeci geçersiz.");
/** Anahtar tek başına (bırakma): biçimsizse `invalid_input`. */
export const parseCreditKey = (key: unknown): string => parseOrThrow(keyField, key, KEY_MESSAGE);
