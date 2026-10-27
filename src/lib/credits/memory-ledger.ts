/**
 * Bellekte kredi defteri: mock deponun (ve birim testlerinin) kullandığı uygulama. Kurallar Supabase ile AYNI (migration 0017): girdi
 * `credit-input.ts`, dağıtım / bölme / bakiye `compute.ts`; hata kodları aynı (`insufficient_credits`, `invalid_input`, `invalid_state`,
 * `not_found`, `already_exists`). Tek hesap tutar (mock'ta tek kullanıcı vardır). Dönen nesneler kopyadır.
 */
import { allocateCredits, balanceOf, splitCharge, type CreditSlice } from "@/lib/credits/compute";
import { assertHoldOpen, InsufficientCreditsError } from "@/lib/credits/errors";
import { parseCreditKey, parseGrantCreditsInput, parseReserveCreditsInput, parseSettleCreditsInput } from "@/lib/data/credit-input";
import { RepositoryError } from "@/lib/data/repository";
import { bucketOfGrant, CREDIT_PURCHASE_VALID_MONTHS, type CreditBalance, type CreditEntry, type CreditHold, type CreditLot } from "@/lib/domain/credits";

export interface MemoryLedgerClock {
  /** Şimdiki an (süre dolumu buna göre). */
  now(): Date;
  /** Yeni satırın zaman damgası (ISO; mock saatinde her çağrıda ilerler). */
  stamp(): string;
}

export interface MemoryCreditLedger {
  /** Kredi verir (yeni parti). SUNUCU işlemidir: depo arayüzünde yoktur. */
  grant(input: unknown): CreditEntry;
  reserve(input: unknown, workspaceId?: string): CreditHold;
  /** Kesinleştirir. İŞÇİ işlemidir: depo arayüzünde yoktur. */
  settle(input: unknown): CreditHold;
  release(key: unknown): CreditHold;
  lots(): CreditLot[];
  balance(): CreditBalance;
  /** Yeniden eskiye. */
  entries(): CreditEntry[];
}

type StoredEntry = CreditEntry & { key: string };
type StoredHold = CreditHold & { allocations: CreditSlice[] };

const copy = <T>(value: T): T => structuredClone(value);
/** Dışarı verilen kopya: iç alan (dağılım / anahtar) taşınmaz. */
function publicHold(stored: StoredHold): CreditHold {
  const hold: Partial<StoredHold> = copy(stored);
  delete hold.allocations;
  return hold as CreditHold;
}
function publicEntry(stored: StoredEntry): CreditEntry {
  const entry: Partial<StoredEntry> = copy(stored);
  delete entry.key;
  return entry as CreditEntry;
}

export function createMemoryCreditLedger(clock: MemoryLedgerClock): MemoryCreditLedger {
  const entries: StoredEntry[] = [];
  const holds: StoredHold[] = [];
  let entrySeq = 0;
  let holdSeq = 0;

  function lots(): CreditLot[] {
    return entries
      .filter((entry) => entry.lotId === undefined)
      .map((lot) => {
        const remaining = lot.amount + entries.filter((entry) => entry.lotId === lot.id).reduce((sum, entry) => sum + entry.amount, 0);
        const held = holds
          .filter((hold) => hold.status === "open")
          .flatMap((hold) => hold.allocations)
          .filter((slice) => slice.lotId === lot.id)
          .reduce((sum, slice) => sum + slice.amount, 0);
        return { id: lot.id, bucket: lot.bucket, granted: lot.amount, remaining, held, free: remaining - held, expiresAt: lot.expiresAt, createdAt: lot.createdAt };
      });
  }

  const findHold = (key: string): StoredHold => {
    const hold = holds.find((candidate) => candidate.key === key);
    if (!hold) throw new RepositoryError("not_found", "Kredi ayırması bulunamadı.");
    return hold;
  };

  return {
    lots: () => copy(lots()),
    balance: () => balanceOf(lots(), clock.now()),
    entries: () => [...entries].reverse().map(publicEntry),

    grant(raw) {
      const input = parseGrantCreditsInput(raw);
      const existing = entries.find((entry) => entry.key === input.key);
      if (existing) {
        if (existing.type !== input.type || existing.amount !== input.amount) throw new RepositoryError("invalid_input", "Aynı işlem anahtarı başka bir hareket için kullanılmış.");
        return publicEntry(existing);
      }
      let expiresAt = input.expiresAt === undefined ? undefined : new Date(input.expiresAt).toISOString();
      if (input.type === "purchase" && expiresAt === undefined) {
        const end = clock.now();
        end.setUTCMonth(end.getUTCMonth() + CREDIT_PURCHASE_VALID_MONTHS);
        expiresAt = end.toISOString();
      }
      const entry: StoredEntry = {
        id: `ce_${String(++entrySeq).padStart(3, "0")}`,
        key: input.key,
        type: input.type,
        amount: input.amount,
        bucket: bucketOfGrant(input.type, input.bucket),
        ...(expiresAt === undefined ? {} : { expiresAt }),
        ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
        ...(input.note ? { note: input.note } : {}),
        createdAt: clock.stamp(),
      };
      entries.push(entry);
      return publicEntry(entry);
    },

    reserve(raw, workspaceId) {
      const input = parseReserveCreditsInput(raw);
      const existing = holds.find((hold) => hold.key === input.key);
      if (existing) {
        if (existing.amount !== input.amount) throw new RepositoryError("invalid_input", "Aynı işlem anahtarı başka bir ayırma için kullanılmış.");
        return assertHoldOpen(publicHold(existing));
      }
      if (input.panelJobId !== undefined && holds.some((hold) => hold.status === "open" && hold.panelJobId === input.panelJobId)) {
        throw new RepositoryError("already_exists", "Bu iş için zaten açık bir kredi ayırması var.");
      }
      const current = lots();
      const allocations = allocateCredits(current, input.amount, clock.now());
      if (allocations === undefined) throw new InsufficientCreditsError(input.amount, balanceOf(current, clock.now()).available);
      const hold: StoredHold = {
        id: `ch_${String(++holdSeq).padStart(3, "0")}`,
        key: input.key,
        amount: input.amount,
        status: "open",
        ...(workspaceId === undefined ? {} : { workspaceId }),
        ...(input.panelJobId === undefined ? {} : { panelJobId: input.panelJobId }),
        ...(input.runId === undefined ? {} : { runId: input.runId }),
        createdAt: clock.stamp(),
        allocations,
      };
      holds.push(hold);
      return publicHold(hold);
    },

    settle(raw) {
      const input = parseSettleCreditsInput(raw);
      const hold = findHold(input.key);
      if (hold.status === "settled") return publicHold(hold);
      if (hold.status === "released") throw new RepositoryError("invalid_state", "Bırakılmış kredi ayırması kesinleştirilemez.");
      if (input.actual > hold.amount) throw new RepositoryError("invalid_input", "Gerçekleşen kredi ayrılanı aşamaz.");
      const bucketOf = new Map(entries.map((entry) => [entry.id, entry.bucket]));
      hold.status = "settled";
      hold.charged = input.actual;
      if (input.units !== undefined) hold.units = input.units;
      if (input.priceVersion !== undefined) hold.priceVersion = input.priceVersion;
      hold.closedAt = clock.stamp();
      for (const slice of splitCharge(hold.allocations, input.actual)) {
        entries.push({
          id: `ce_${String(++entrySeq).padStart(3, "0")}`,
          key: `charge:${hold.id}:${slice.lotId}`,
          type: "charge",
          amount: -slice.amount,
          bucket: bucketOf.get(slice.lotId) ?? "purchased",
          lotId: slice.lotId,
          holdId: hold.id,
          ...(hold.workspaceId === undefined ? {} : { workspaceId: hold.workspaceId }),
          ...(hold.panelJobId === undefined ? {} : { panelJobId: hold.panelJobId }),
          ...(hold.runId === undefined ? {} : { runId: hold.runId }),
          ...(hold.units === undefined ? {} : { units: hold.units }),
          ...(hold.priceVersion === undefined ? {} : { priceVersion: hold.priceVersion }),
          createdAt: hold.closedAt,
        });
      }
      return publicHold(hold);
    },

    release(rawKey) {
      const hold = findHold(parseCreditKey(rawKey));
      if (hold.status === "open") {
        hold.status = "released";
        hold.closedAt = clock.stamp();
      }
      return publicHold(hold);
    },
  };
}
