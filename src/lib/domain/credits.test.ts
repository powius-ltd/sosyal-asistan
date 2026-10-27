import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { creditUnitsSchema, grantCreditsSchema, reserveCreditsSchema, settleCreditsSchema } from "@/lib/data/credit-input";
import { CREDIT_ITEMS } from "@/lib/domain/credit-pricing";
import { bucketOfGrant, CREDIT_BUCKETS, CREDIT_ENTRY_TYPES, CREDIT_GRANT_TYPES, CREDIT_HOLD_MAX, CREDIT_HOLD_STATUSES, CREDIT_KEY_PATTERN } from "@/lib/domain/credits";

const sql = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/0017_credits.sql", import.meta.url)), "utf8");

/** `sütun in ('a', 'b')` listesini SQL'den okur (ilk eşleşme). */
function sqlList(column: string): string[] {
  const match = new RegExp(`${column} in \\(([^)]+)\\)`).exec(sql);
  if (!match) throw new Error(`SQL'de ${column} listesi bulunamadı`);
  return match[1].split(",").map((part) => part.trim().replace(/^'|'$/g, ""));
}

describe("kredi domain listeleri ↔ migration 0017", () => {
  it("hareket türleri, kovalar ve ayırma durumları SQL CHECK'leriyle birebir", () => {
    expect(sqlList("entry_type")).toEqual([...CREDIT_ENTRY_TYPES]);
    expect(sqlList("bucket")).toEqual([...CREDIT_BUCKETS]);
    expect(sqlList("status")).toEqual([...CREDIT_HOLD_STATUSES]);
    expect(sqlList("p_type not")).toEqual([...CREDIT_GRANT_TYPES]);
  });

  it("anahtar biçimi ayırma tablosunun CHECK'iyle aynı", () => {
    expect(sql).toContain(`idempotency_key ~ '${CREDIT_KEY_PATTERN.source}'`);
  });

  it("verme türü kovasını belirler; yalnız düzeltmede kova seçilir", () => {
    expect([bucketOfGrant("grant_monthly"), bucketOfGrant("purchase"), bucketOfGrant("adjust"), bucketOfGrant("adjust", "monthly")]).toEqual(["monthly", "purchased", "purchased", "monthly"]);
    expect(bucketOfGrant("purchase", "monthly"), "türün kovası ezilemez").toBe("purchased");
  });
});

describe("kredi girdi şemaları", () => {
  const ok = (schema: { safeParse(input: unknown): { success: boolean } }, input: unknown) => schema.safeParse(input).success;

  it("ayırma: pozitif tam sayı tutar + biçimli anahtar; bilinmeyen alan (hesap sahibi) reddedilir", () => {
    expect(ok(reserveCreditsSchema, { amount: 190, key: "0b7e3c1a-1111-4222-8333-444455556666" })).toBe(true);
    expect(ok(reserveCreditsSchema, { amount: CREDIT_HOLD_MAX, key: "run:42" })).toBe(true);
    for (const bad of [{ amount: 0, key: "k" }, { amount: 1.5, key: "k" }, { amount: CREDIT_HOLD_MAX + 1, key: "k" }, { amount: 1, key: "a b" }, { amount: 1, key: "k", ownerUserId: "x" }]) {
      expect(ok(reserveCreditsSchema, bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("kesinleştirme: gerçekleşen 0 olabilir; birimler yalnız fiyat tablosundaki kalemler", () => {
    expect(ok(settleCreditsSchema, { key: "k", actual: 0 })).toBe(true);
    expect(ok(settleCreditsSchema, { key: "k", actual: 74, units: { video_review: 7, briefing: 1 }, priceVersion: "2026-10-12" })).toBe(true);
    expect(ok(settleCreditsSchema, { key: "k", actual: -1 })).toBe(false);
    expect(ok(creditUnitsSchema, Object.fromEntries(CREDIT_ITEMS.map((item) => [item, 1])))).toBe(true);
    for (const bad of [{ token: 5 }, { video_review: -1 }, { video_review: 1.5 }]) expect(ok(creditUnitsSchema, bad), JSON.stringify(bad)).toBe(false);
  });

  it("verme: aylık kredi dönem sonu ister; kova türle çelişemez; düşüm türü verilemez", () => {
    expect(ok(grantCreditsSchema, { type: "grant_monthly", amount: 1000, key: "2026-10", expiresAt: "2026-10-31T21:00:00.000Z" })).toBe(true);
    expect(ok(grantCreditsSchema, { type: "purchase", amount: 500, key: "odeme-1" })).toBe(true);
    expect(ok(grantCreditsSchema, { type: "adjust", amount: 50, key: "duzeltme-1", bucket: "monthly", expiresAt: "2026-10-31T21:00:00.000Z", note: "Başlangıç bakiyesi" })).toBe(true);
    for (const bad of [
      { type: "grant_monthly", amount: 1000, key: "k" },
      { type: "purchase", amount: 500, key: "k", bucket: "monthly" },
      { type: "charge", amount: 5, key: "k" },
      { type: "adjust", amount: -5, key: "k" },
      { type: "purchase", amount: 5, key: "k", expiresAt: "yarın" },
    ]) {
      expect(ok(grantCreditsSchema, bad), JSON.stringify(bad)).toBe(false);
    }
  });
});
