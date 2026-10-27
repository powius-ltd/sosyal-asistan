import type { OwnAccount } from "@/lib/domain/competitor";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { first } from "@/lib/search-params";

export interface AccountScope {
  /** Seçili kendi hesap; undefined = tüm hesaplar. `getOverview`/`listContent` buna `accountId`/`ownerId` ile süzülür. */
  selected?: OwnAccount;
}

/** `?hesap=<id>` değerini kendi hesaplara karşı doğrular; bilinmeyen kimlik = tüm hesaplar. */
export function resolveAccountScope(
  accounts: OwnAccount[],
  raw: string | string[] | undefined,
): AccountScope {
  const id = first(raw);
  return { selected: id ? accounts.find((account) => account.id === id) : undefined };
}

const accountLabel = (account: OwnAccount): string => `@${account.handle} · ${PLATFORM_LABEL[account.platform]}`;

/**
 * Grafik / sayı kapsamı: süzgeçte seçili hesap ya da çalışma alanında tek hesap varsa onun adı, yoksa "Tüm hesaplar"
 * (tek hesapta "Tüm hesaplar" yazmak yanıltırdı; D3-06).
 */
export function chartScopeLabel(accounts: readonly OwnAccount[], selected?: OwnAccount): string {
  const only = selected ?? (accounts.length === 1 ? accounts[0] : undefined);
  return only ? accountLabel(only) : "Tüm hesaplar";
}

/**
 * Notların kapsamı: notlar çalışma alanı bazlıdır, hesap süzgeci onları değiştirmez, bu yüzden süzgeç seçiliyken de
 * "Tüm hesapların için" yazar; çalışma alanında tek hesap varsa o hesabın adı (D3-06).
 */
export function notesScopeLabel(accounts: readonly OwnAccount[]): string {
  return accounts.length === 1 ? `${accountLabel(accounts[0])} için` : "Tüm hesapların için";
}
