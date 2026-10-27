/**
 * Fiş hesabı ve üretim modu çözümü (uygulama içi fiş). Stüdyo tablosunda (`accounts.ts`) tanımlı hesap varsa onun slug'ı ve modu geçerlidir.
 * Tanımlı değilse hata ATILMAZ: hesap kimliği çalışma alanının slug'ından (yoksa @handle'ından) türer, mod fikirden: senaryo metni varsa
 * `senaryo`, yoksa `konu`. Dosya yazan yol (`run.ts`, betik) tanımsız hesapta hâlâ `studioAccountOf` ile hata verir; bu dosya ona dokunmaz.
 */
import { foldTurkish } from "@/lib/text";
import { findStudioAccount } from "@/lib/studio-order/accounts";
import type { OrderMode } from "@/lib/studio-order/schema";

export interface ResolvedOrderAccount {
  /** Fişteki `hesap` (stüdyo slug'ı ya da türetilmiş kimlik). */
  slug: string;
  mode: OrderMode;
  /** Stüdyo tablosunda tanımlı mı. */
  inStudio: boolean;
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** "@Ornek.Ozkan" → "ornek-ozkan"; geçerli kimlik çıkmazsa undefined. */
export function slugifyAccount(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const slug = foldTurkish(raw).replace(/^@/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return SLUG.test(slug) ? slug : undefined;
}

export interface AccountModeInput {
  /** Çalışma alanı slug'ı (kayıttan). */
  panelSlug?: string;
  /** Kendi hesabın @handle'ı (slug yoksa yedek). */
  handle?: string;
  /** Fikirde senaryo metni (script) var mı. */
  hasScript: boolean;
}

export function resolveOrderAccount(input: AccountModeInput): ResolvedOrderAccount | undefined {
  const known = findStudioAccount(input.panelSlug);
  if (known) return { slug: known.studioSlug, mode: known.mode, inStudio: true };
  const slug = slugifyAccount(input.panelSlug) ?? slugifyAccount(input.handle);
  if (slug === undefined) return undefined;
  return { slug, mode: input.hasScript ? "senaryo" : "konu", inStudio: false };
}

