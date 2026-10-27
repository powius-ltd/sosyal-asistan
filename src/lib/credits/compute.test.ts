import { describe, expect, it } from "vitest";

import { allocateCredits, balanceOf, isLotAlive, spendOrder, splitCharge } from "@/lib/credits/compute";
import { createMemoryCreditLedger } from "@/lib/credits/memory-ledger";
import type { CreditLot } from "@/lib/domain/credits";

const NOW = new Date("2026-10-12T09:00:00.000Z");
const SOON = "2026-10-31T21:00:00.000Z";
const LATER = "2027-06-01T00:00:00.000Z";
const PAST = "2026-10-01T00:00:00.000Z";

const lot = (id: string, patch: Partial<CreditLot> = {}): CreditLot => {
  const base = { id, bucket: "purchased" as const, granted: 100, remaining: 100, held: 0, createdAt: "2026-09-01T00:00:00.000Z", ...patch };
  return { ...base, free: patch.free ?? base.remaining - base.held };
};

describe("kredi hesabı: harcama sırası", () => {
  it("önce aylık kova; kova içinde süresi en yakın dolan, süresiz en sonda, sonra en eski", () => {
    const lots = [
      lot("ek-suresiz"),
      lot("ek-gec", { expiresAt: LATER }),
      lot("ek-yakin", { expiresAt: SOON }),
      lot("aylik", { bucket: "monthly", expiresAt: LATER }),
      lot("ek-yakin-eski", { expiresAt: SOON, createdAt: "2026-08-01T00:00:00.000Z" }),
    ];
    expect(spendOrder(lots).map((entry) => entry.id)).toEqual(["aylik", "ek-yakin-eski", "ek-yakin", "ek-gec", "ek-suresiz"]);
  });

  it("son kullanma anı GELDİYSE parti dolmuştur (sınır dahil)", () => {
    expect(isLotAlive({ expiresAt: NOW.toISOString() }, NOW)).toBe(false);
    expect(isLotAlive({ expiresAt: new Date(NOW.getTime() + 1).toISOString() }, NOW)).toBe(true);
    expect(isLotAlive({}, NOW)).toBe(true);
  });
});

describe("kredi hesabı: bakiye", () => {
  it("kullanılabilir = süresi dolmamış partilerin serbest kalanı; süresi dolan ve ayrılan sayılmaz", () => {
    const balance = balanceOf(
      [
        lot("aylik", { bucket: "monthly", remaining: 400, held: 150, expiresAt: SOON }),
        lot("ek", { remaining: 300, expiresAt: LATER }),
        lot("yanmis", { bucket: "monthly", remaining: 250, expiresAt: PAST }),
        lot("tukenmis", { remaining: 0, expiresAt: SOON }),
      ],
      NOW,
    );
    expect(balance).toEqual({ available: 550, monthly: 250, purchased: 300, held: 150, nextExpiry: { at: SOON, amount: 250, bucket: "monthly" } });
  });

  it("boş defter: bilinen sıfır; süreli serbest kredi yoksa ilk dolacak bildirilmez", () => {
    expect(balanceOf([], NOW)).toEqual({ available: 0, monthly: 0, purchased: 0, held: 0 });
    expect(balanceOf([lot("suresiz", { remaining: 10 })], NOW).nextExpiry).toBeUndefined();
  });

  it("süresi ayırmadan SONRA dolan partinin ayrılmış kısmı `held`de görünür, bakiyeye girmez", () => {
    expect(balanceOf([lot("yanmis", { bucket: "monthly", remaining: 100, held: 60, expiresAt: PAST })], NOW)).toEqual({ available: 0, monthly: 0, purchased: 0, held: 60 });
  });
});

describe("kredi hesabı: ayırma ve kesinleştirme", () => {
  const lots = [lot("ek", { remaining: 50, expiresAt: LATER }), lot("aylik", { bucket: "monthly", remaining: 100, held: 30, expiresAt: SOON }), lot("yanmis", { bucket: "monthly", remaining: 500, expiresAt: PAST })];

  it("ayırma harcama sırasıyla dağıtılır; süresi dolmuş parti ve ayrılmış kısım kullanılmaz", () => {
    expect(allocateCredits(lots, 90, NOW)).toEqual([
      { lotId: "aylik", amount: 70 },
      { lotId: "ek", amount: 20 },
    ]);
    expect(allocateCredits(lots, 120, NOW)).toEqual([
      { lotId: "aylik", amount: 70 },
      { lotId: "ek", amount: 50 },
    ]);
  });

  it("yetmezse kısmi ayırma YOK (undefined); geçersiz tutar da ayrılmaz", () => {
    expect(allocateCredits(lots, 121, NOW)).toBeUndefined();
    for (const amount of [0, -1, 1.5, Number.NaN]) expect(allocateCredits(lots, amount, NOW), String(amount)).toBeUndefined();
  });

  it("kesinleşen tutar dağılımın başından düşülür; artan serbest kalır; sıfırda satır yok; dağılımı aşan tutar hata", () => {
    const allocations = [
      { lotId: "aylik", amount: 70 },
      { lotId: "ek", amount: 20 },
    ];
    expect(splitCharge(allocations, 75)).toEqual([
      { lotId: "aylik", amount: 70 },
      { lotId: "ek", amount: 5 },
    ]);
    expect(splitCharge(allocations, 40)).toEqual([{ lotId: "aylik", amount: 40 }]);
    expect(splitCharge(allocations, 0)).toEqual([]);
    expect(() => splitCharge(allocations, 91)).toThrow(RangeError);
  });
});

describe("bellekte defter: eksi bakiye imkânsız", () => {
  it("art arda ayırmalar toplamı bakiyeyi aşamaz; her adımda bakiye ≥ 0 ve defter toplamı = bakiye + ayrılan", () => {
    let tick = 0;
    const ledger = createMemoryCreditLedger({ now: () => new Date(NOW), stamp: () => new Date(NOW.getTime() + ++tick * 1000).toISOString() });
    ledger.grant({ type: "grant_monthly", amount: 70, key: "m", expiresAt: SOON });
    ledger.grant({ type: "purchase", amount: 30, key: "p" });
    let accepted = 0;
    for (let index = 0; index < 8; index++) {
      try {
        ledger.reserve({ amount: 30, key: `job-${index}` });
        accepted += 1;
      } catch (error) {
        expect((error as { code?: string }).code).toBe("insufficient_credits");
      }
      const balance = ledger.balance();
      expect(balance.available).toBeGreaterThanOrEqual(0);
      expect(balance.available + balance.held).toBe(100);
    }
    expect(accepted, "100 krediden 30'luk yalnız 3 ayırma çıkar").toBe(3);
    ledger.settle({ key: "job-0", actual: 30 });
    ledger.settle({ key: "job-1", actual: 10 });
    ledger.release("job-2");
    expect(ledger.balance()).toMatchObject({ available: 60, monthly: 30, purchased: 30, held: 0 });
    expect(ledger.entries().reduce((total, entry) => total + entry.amount, 0), "defter toplamı = bakiye").toBe(60);
    expect(ledger.lots().every((entry) => entry.free >= 0 && entry.remaining >= 0)).toBe(true);
  });
});
