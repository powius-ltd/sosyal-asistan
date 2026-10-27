/**
 * Hesap yayınlanabilir mi (TEK kural): resmi API'ye bağlı hesap YA DA çalışma alanının Zernio anahtarı olan (aracı üzerinden yayın) hesap.
 * `createPublishJob` (Supabase ve mock) bunu çağırır; başka davranış değişmez. Anahtar DEĞERİ okunmaz, yalnız varlığı (`pickZernioKey`).
 */
import "server-only";
import { pickZernioKey } from "@/lib/zernio/api-key";

export function workspaceHasZernioKey(slug: string | undefined, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return pickZernioKey(slug, env) !== undefined;
}

export function isPublishableAccount(account: { connection: string }, zernioKeyPresent: boolean): boolean {
  return account.connection === "connected" || zernioKeyPresent;
}
