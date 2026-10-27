/**
 * Kredi satırları → domain (`credit_ledger`, `credit_holds`, görünüm `credit_lots`). Kural: DB `NULL` = domain `undefined` (0 değil).
 * Tür / kova / durum DB CHECK'inden gelir; domain listesinde yoksa şema ile domain ayrışmıştır (açık hata, sessiz varsayılan yok).
 * `units` jsonb'si yazma sözleşmesiyle (`creditUnitsSchema`) okunur; bozuksa alan boşa düşer (satır gizlenmez).
 */
import { creditUnitsSchema } from "@/lib/data/credit-input";
import {
  CREDIT_BUCKETS,
  CREDIT_ENTRY_TYPES,
  CREDIT_HOLD_STATUSES,
  type CreditBucket,
  type CreditChargeUnits,
  type CreditEntry,
  type CreditEntryType,
  type CreditHold,
  type CreditHoldStatus,
  type CreditLot,
} from "@/lib/domain/credits";
import type { Json, Tables } from "@/lib/supabase/database.types";

export const ENTRY_COLUMNS =
  "id, entry_type, amount, bucket, lot_id, expires_at, workspace_id, panel_job_id, run_id, hold_id, units, price_version, note, created_at" as const;

export type CreditEntryRow = Pick<
  Tables<"credit_ledger">,
  "id" | "entry_type" | "amount" | "bucket" | "lot_id" | "expires_at" | "workspace_id" | "panel_job_id" | "run_id" | "hold_id" | "units" | "price_version" | "note" | "created_at"
>;
export type CreditHoldRow = Tables<"credit_holds">;
export type CreditLotRow = Tables<"credit_lots">;

function oneOf<T extends string>(list: readonly T[], value: string, what: string): T {
  if (!(list as readonly string[]).includes(value)) throw new Error(`Kredi satırı eşlenemedi: bilinmeyen ${what} "${value}".`);
  return value as T;
}

const iso = (value: string): string => new Date(value).toISOString();
const optional = <K extends string, V>(key: K, value: V | null | undefined): { [P in K]?: V } => (value === null || value === undefined ? {} : ({ [key]: value } as { [P in K]?: V }));

function unitsOf(value: Json | null): CreditChargeUnits | undefined {
  if (value === null) return undefined;
  const parsed = creditUnitsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function toCreditEntry(row: CreditEntryRow): CreditEntry {
  return {
    id: row.id,
    type: oneOf<CreditEntryType>(CREDIT_ENTRY_TYPES, row.entry_type, "hareket türü"),
    amount: row.amount,
    bucket: oneOf<CreditBucket>(CREDIT_BUCKETS, row.bucket, "kova"),
    ...optional("lotId", row.lot_id),
    ...optional("expiresAt", row.expires_at === null ? null : iso(row.expires_at)),
    ...optional("workspaceId", row.workspace_id),
    ...optional("panelJobId", row.panel_job_id),
    ...optional("runId", row.run_id),
    ...optional("holdId", row.hold_id),
    ...optional("units", unitsOf(row.units)),
    ...optional("priceVersion", row.price_version),
    ...optional("note", row.note),
    createdAt: iso(row.created_at),
  };
}

export function toCreditHold(row: CreditHoldRow): CreditHold {
  return {
    id: row.id,
    key: row.idempotency_key,
    amount: row.amount,
    status: oneOf<CreditHoldStatus>(CREDIT_HOLD_STATUSES, row.status, "ayırma durumu"),
    ...optional("charged", row.charged),
    ...optional("workspaceId", row.workspace_id),
    ...optional("panelJobId", row.panel_job_id),
    ...optional("runId", row.run_id),
    ...optional("units", unitsOf(row.units)),
    ...optional("priceVersion", row.price_version),
    createdAt: iso(row.created_at),
    ...optional("closedAt", row.closed_at === null ? null : iso(row.closed_at)),
  };
}

/** Görünüm satırı (sütunlar tip üretiminde NULL olabilir görünür; eksik satır atlanır). */
export function toCreditLot(row: CreditLotRow): CreditLot | undefined {
  if (row.lot_id === null || row.bucket === null || row.granted === null || row.remaining === null || row.held === null || row.free === null || row.created_at === null) {
    return undefined;
  }
  return {
    id: row.lot_id,
    bucket: oneOf<CreditBucket>(CREDIT_BUCKETS, row.bucket, "kova"),
    granted: row.granted,
    remaining: row.remaining,
    held: row.held,
    free: row.free,
    ...optional("expiresAt", row.expires_at === null ? null : iso(row.expires_at)),
    createdAt: iso(row.created_at),
  };
}
