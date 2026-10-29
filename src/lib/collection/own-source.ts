/**
 * Kendi hesabın verisi nereden gelir: Zernio anahtarı olan ve kendi hesabında en az bir içerik zaten bulunan çalışma alanında kendi
 * hesap Apify'a GİTMEZ (sayılar her gün Zernio'dan ücretsiz okunur: `measure_zernio`); yalnız rakipler toplanır. İlk toplama (hiç kendi
 * içerik yok: başlangıç akışı) Apify'la yapılır, çünkü eski videoların incelemesi Apify'ın video adresini ister. Anahtar değeri okunmaz,
 * yalnız varlığı (`pickZernioKey`).
 */
import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";
import { pickZernioKey } from "@/lib/zernio/api-key";

export type OwnSource = "apify" | "zernio";

export async function ownSourceOf(
  client: AdminClient,
  workspaceId: string,
  ownAccountIds: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Promise<OwnSource> {
  if (ownAccountIds.length === 0) return "apify";
  const ws = await client.from("workspaces").select("slug").eq("id", workspaceId).maybeSingle();
  if (ws.error) throw new Error(`Toplama: çalışma alanı okunamadı (${ws.error.message}).`);
  if (pickZernioKey(ws.data?.slug ?? undefined, env) === undefined) return "apify";
  const seen = await client
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .in("social_account_id", [...ownAccountIds]);
  if (seen.error) throw new Error(`Toplama: kendi içerik sayısı okunamadı (${seen.error.message}).`);
  return (seen.count ?? 0) > 0 ? "zernio" : "apify";
}
