/**
 * Kredi defterinin SUNUCU işlevleri (Supabase RPC sarmalayıcıları; migration 0017). `lib/apify/budget.ts` ile aynı katman: yalnız service
 * role, çağıran yetkiyi kendisi doğrular. Kim neyi çağırır:
 *  - PANEL süreci (depo üzerinden): iş isteği ayırmayı iş satırıyla AYNI transaction'da yapar (`request_panel_job_credited`, 0020); depo
 *    arayüzündeki `reserveCredits` / `releaseCredits` işe bağlı olmayan ayırmalar içindir (sohbet, Dilim 5).
 *  - İŞÇİ (doğrudan buradan): iş kapanırken yapılan birim kadar `settleCredits`, hiç birim yoksa `releaseCredits`; başında `sweepJobCredits`.
 *  - YÖNETİCİ / ödeme (doğrudan buradan): `grantCredits` (başlangıç bakiyesi, aylık kredi, ek satın alma).
 * Hepsi idempotenttir (anahtar: iş kimliği; sohbette koşu kimliği; vermede ödeme / dönem anahtarı). Girdi `credit-input.ts` ile doğrulanır,
 * DB hatası `toRepositoryError` ile çevrilir (yetersiz kredi → `InsufficientCreditsError`).
 * İş akışına bağlama `CREDITS_ENFORCED` anahtarının arkasındadır (`lib/credits/enforcement.ts`; varsayılan kapalı).
 */
import "server-only";

import { balanceOf } from "@/lib/credits/compute";
import { assertHoldOpen } from "@/lib/credits/errors";
import { toCreditEntry, toCreditHold, toCreditLot, ENTRY_COLUMNS } from "@/lib/credits/rows";
import {
  parseCreditEntryFilter,
  parseCreditKey,
  parseGrantCreditsInput,
  parseReserveCreditsInput,
  parseSettleCreditsInput,
} from "@/lib/data/credit-input";
import { RepositoryError } from "@/lib/data/repository";
import { isUuid, unwrap } from "@/lib/data/supabase/errors";
import { clampLimit } from "@/lib/data/supabase/paging";
import type { CreditBalance, CreditEntry, CreditHold, CreditLot } from "@/lib/domain/credits";
import type { AdminClient } from "@/lib/supabase/admin";

/** Bağlı kayıt kimliği DB'de UUID'dir: biçimsiz değer sorguya gitmez. */
function uuidOrThrow(value: string | undefined, what: string): string | undefined {
  if (value !== undefined && !isUuid(value)) throw new RepositoryError("invalid_input", `${what} kimliği geçersiz.`);
  return value;
}

/** Kullanıcıya kredi verir (yeni parti; hesap yoksa açılır). Aynı anahtarla ikinci çağrı ilk satırı döndürür. */
export async function grantCredits(client: AdminClient, ownerUserId: string, raw: unknown): Promise<CreditEntry> {
  const input = parseGrantCreditsInput(raw);
  const row = unwrap(
    await client.rpc("grant_credits", {
      p_owner: ownerUserId,
      p_type: input.type,
      p_amount: input.amount,
      p_key: input.key,
      p_bucket: input.bucket,
      p_expires_at: input.expiresAt === undefined ? undefined : new Date(input.expiresAt).toISOString(),
      p_ws: uuidOrThrow(input.workspaceId, "Çalışma alanı"),
      p_note: input.note,
    }),
  );
  return toCreditEntry(row);
}

/**
 * En çok tutarı ayırır. Yetmezse `InsufficientCreditsError` (hiçbir satır yazılmaz). Aynı anahtarla ikinci çağrı AÇIK ayırmayı aynen
 * döndürür; ayırma kapanmışsa (kesinleşmiş / bırakılmış) `invalid_state`: çağıran "ayrıldı" sanıp işi kredisiz koşturmasın.
 */
export async function reserveCredits(client: AdminClient, ownerUserId: string, raw: unknown, workspaceId?: string): Promise<CreditHold> {
  const input = parseReserveCreditsInput(raw);
  const row = unwrap(
    await client.rpc("reserve_credits", {
      p_owner: ownerUserId,
      p_amount: input.amount,
      p_key: input.key,
      p_ws: uuidOrThrow(workspaceId, "Çalışma alanı"),
      p_job: uuidOrThrow(input.panelJobId, "İş"),
      p_run: uuidOrThrow(input.runId, "Koşu"),
    }),
  );
  return assertHoldOpen(toCreditHold(row));
}

/** Gerçekleşeni düşer (≤ ayrılan), farkı serbest bırakır. Kesinleşmiş ayırmada ikinci çağrı ilk sonucu döndürür (çift düşüm yok). */
export async function settleCredits(client: AdminClient, raw: unknown): Promise<CreditHold> {
  const input = parseSettleCreditsInput(raw);
  const row = unwrap(await client.rpc("settle_credits", { p_key: input.key, p_actual: input.actual, p_units: input.units, p_price_version: input.priceVersion }));
  return toCreditHold(row);
}

/** Açık ayırmayı düşmeden bırakır. Bırakılmış ya da kesinleşmiş ayırma aynen döner (çağıran `status`'tan anlar). */
export async function releaseCredits(client: AdminClient, rawKey: unknown): Promise<CreditHold> {
  return toCreditHold(unwrap(await client.rpc("release_credits", { p_key: parseCreditKey(rawKey) })));
}

/** Kullanıcının hesap kimliği; hiç kredi verilmediyse (hesap yok) undefined. */
export async function findCreditAccountId(client: AdminClient, ownerUserId: string): Promise<string | undefined> {
  if (!isUuid(ownerUserId)) return undefined;
  const row = unwrap(await client.from("credit_accounts").select("id").eq("owner_user_id", ownerUserId).maybeSingle());
  return row?.id;
}

/** Anahtarın ayırması, YALNIZ bu kullanıcının hesabındaysa (başkasının ayırması "yok" sayılır). */
export async function findCreditHold(client: AdminClient, ownerUserId: string, rawKey: unknown): Promise<CreditHold | undefined> {
  const key = parseCreditKey(rawKey);
  const accountId = await findCreditAccountId(client, ownerUserId);
  if (accountId === undefined) return undefined;
  const row = unwrap(await client.from("credit_holds").select("*").eq("account_id", accountId).eq("idempotency_key", key).maybeSingle());
  return row === null ? undefined : toCreditHold(row);
}

/** Anahtarın ayırması, hesap süzgeci OLMADAN (İŞÇİ: işin ayırması anahtarı iş kimliğidir; sahibi satırdadır). Yoksa undefined. */
export async function readCreditHold(client: AdminClient, rawKey: unknown): Promise<CreditHold | undefined> {
  const row = unwrap(await client.from("credit_holds").select("*").eq("idempotency_key", parseCreditKey(rawKey)).maybeSingle());
  return row === null ? undefined : toCreditHold(row);
}

/** Bu kuyruğun "işi bitmiş, ayırması açık" kayıtlarını kapatır (`sweep_panel_job_credits`, 0020); kapatılan ayırma sayısı. */
export async function sweepJobCredits(client: AdminClient, queue: string): Promise<number> {
  return unwrap(await client.rpc("sweep_panel_job_credits", { p_queue: queue }));
}

/** Kullanıcının partileri (verilen / kalan / ayrılan / serbest). Hesap yoksa boş. */
export async function readCreditLots(client: AdminClient, ownerUserId: string): Promise<CreditLot[]> {
  const accountId = await findCreditAccountId(client, ownerUserId);
  if (accountId === undefined) return [];
  // Tükenmiş ve ayırması olmayan parti bakiyeye girmez: okunmaz.
  const rows = unwrap(await client.from("credit_lots").select("*").eq("account_id", accountId).or("remaining.gt.0,held.gt.0").order("created_at", { ascending: true }));
  return rows.flatMap((row) => toCreditLot(row) ?? []);
}

/** Türetilmiş bakiye: mock ile AYNI saf fonksiyon (`balanceOf`), parti satırlarından. Hesap yoksa hepsi 0. */
export async function readCreditBalance(client: AdminClient, ownerUserId: string, now: Date): Promise<CreditBalance> {
  return balanceOf(await readCreditLots(client, ownerUserId), now);
}

/** Kullanıcının hareketleri, yeniden eskiye. `workspaceId` verilirse yalnız o çalışma alanı için yazılanlar. */
export async function listCreditEntries(client: AdminClient, ownerUserId: string, rawFilter: unknown, workspaceId?: string): Promise<CreditEntry[]> {
  const filter = parseCreditEntryFilter(rawFilter);
  if (filter.types !== undefined && filter.types.length === 0) return [];
  const accountId = await findCreditAccountId(client, ownerUserId);
  if (accountId === undefined) return [];
  let query = client.from("credit_ledger").select(ENTRY_COLUMNS).eq("account_id", accountId);
  if (filter.types !== undefined) query = query.in("entry_type", filter.types);
  if (filter.onlyWorkspace && workspaceId !== undefined) query = query.eq("workspace_id", workspaceId);
  const rows = unwrap(await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(clampLimit(filter.limit)));
  return rows.map(toCreditEntry);
}
