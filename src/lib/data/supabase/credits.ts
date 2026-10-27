/**
 * Kredi defteri (Supabase): `getCreditBalance`, `listCreditEntries`, `reserveCredits`, `releaseCredits`. Kurallar DB'dedir (migration 0017:
 * kilit, idempotency, eksi bakiye koruması); burada girdi doğrulanır, çalışma alanı denetlenir ve iş `lib/credits/ledger.ts`'e devredilir.
 * Hesap sahibi `ctx.creditOwnerUserId`'dir (girdiden GELMEZ); `wsId` yalnız harcamanın yeridir. Bakiye mock ile AYNI saf fonksiyonla
 * (`balanceOf`) parti satırlarından türetilir. Düşüm (`settleCredits`) ve kredi verme (`grantCredits`) depoda YOKTUR: işçi / sunucu işidir.
 */
import * as ledger from "@/lib/credits/ledger";
import { parseCreditEntryFilter, parseCreditKey, parseReserveCreditsInput } from "@/lib/data/credit-input";
import { RepositoryError } from "@/lib/data/repository";
import { isUuid } from "@/lib/data/supabase/errors";
import type { SupabaseMethod } from "@/lib/data/supabase/not-implemented";
import { getWorkspace, requireWorkspace } from "@/lib/data/supabase/workspace";

export const getCreditBalance: SupabaseMethod<"getCreditBalance"> = async (ctx, wsId) => {
  await requireWorkspace(ctx, wsId);
  return ledger.readCreditBalance(ctx.db, ctx.creditOwnerUserId, ctx.now());
};

export const listCreditEntries: SupabaseMethod<"listCreditEntries"> = async (ctx, wsId, filter) => {
  const parsed = parseCreditEntryFilter(filter);
  // Mock ile aynı: bilinmeyen çalışma alanı boş liste (başka çalışma alanının kimliğiyle hesabın hareketleri okunamaz).
  if (!isUuid(wsId) || (await getWorkspace(ctx, wsId)) === null) return [];
  return ledger.listCreditEntries(ctx.db, ctx.creditOwnerUserId, parsed, wsId);
};

export const reserveCredits: SupabaseMethod<"reserveCredits"> = async (ctx, wsId, input) => {
  const request = parseReserveCreditsInput(input);
  await requireWorkspace(ctx, wsId);
  return ledger.reserveCredits(ctx.db, ctx.creditOwnerUserId, request, wsId);
};

export const releaseCredits: SupabaseMethod<"releaseCredits"> = async (ctx, wsId, key) => {
  const parsed = parseCreditKey(key);
  await requireWorkspace(ctx, wsId);
  // Yalnız bu kullanıcının ayırması bırakılabilir: başkasının anahtarı "yok" sayılır.
  if ((await ledger.findCreditHold(ctx.db, ctx.creditOwnerUserId, parsed)) === undefined) throw new RepositoryError("not_found", "Kredi ayırması bulunamadı.");
  return ledger.releaseCredits(ctx.db, parsed);
};
