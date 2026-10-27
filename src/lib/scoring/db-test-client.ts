/**
 * Entegrasyon testleri (`*.db.test.ts`) için lokal Supabase service role istemcisi. YALNIZ testler kullanır.
 *
 * Değerler `.env.local`'den (ya da ortamdan) okunur, hiçbir yere yazılmaz/loglanmaz. Yalnız lokal adrese
 * (127.0.0.1 / localhost) bağlanır; env yoksa, adres lokal değilse ya da Supabase yanıt vermiyorsa istemci yerine
 * atlama nedeni döner (test `skip` olur).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { vi } from "vitest";

import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";

export type LocalSupabase = { client: AdminClient; skip?: undefined } | { client?: undefined; skip: string };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function readLocalEnv(): { url?: string; key?: string } {
  const file = resolve(process.cwd(), ".env.local");
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  return {
    url: (process.env.NEXT_PUBLIC_SUPABASE_URL || fromFile.NEXT_PUBLIC_SUPABASE_URL)?.trim(),
    key: (process.env.SUPABASE_SERVICE_ROLE_KEY || fromFile.SUPABASE_SERVICE_ROLE_KEY)?.trim(),
  };
}

function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function connectLocalSupabase(): Promise<LocalSupabase> {
  const { url, key } = readLocalEnv();
  if (!url || !key) return { skip: "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok (.env.local)" };
  if (!isLocalUrl(url)) return { skip: "yalnız lokal Supabase'te koşar (URL lokal değil)" };

  // İstemci env'i oluşturulurken okur; hemen geri alınır (başka testlere sızmaz).
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key);
  let client: AdminClient;
  try {
    client = createAdminClient();
  } finally {
    vi.unstubAllEnvs();
  }

  try {
    const { error } = await client.from("workspaces").select("id").limit(1).abortSignal(AbortSignal.timeout(3000));
    if (error) return { skip: `Supabase yanıt vermiyor (${error.message})` };
  } catch (error) {
    return { skip: `Supabase yanıt vermiyor (${error instanceof Error ? error.message : "bilinmeyen hata"})` };
  }
  return { client };
}
