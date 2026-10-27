/**
 * Toplanacak hedefler: çalışma alanının kendi hesapları + `tracked` rakipleri (yoksayılan/aday/private/not_found
 * toplanmaz). Kayıtlı platform modülü olmayan hesap atlanır ve adıyla raporlanır.
 */
import "server-only";

import type { CollectTarget } from "@/lib/collection/types";
import { hasPlatformModule } from "@/lib/platforms/registry";
import type { AdminClient } from "@/lib/supabase/admin";

export interface LoadedTargets {
  targets: CollectTarget[];
  /** Platform modülü olmadığı için atlananlar (`@ad (platform)`). */
  skipped: string[];
}

export interface LoadTargetsOptions {
  /** true: yalnız kendi hesaplar (ölçüm koşusu); rakipler hiç okunmaz. */
  ownOnly?: boolean;
}

export async function loadTargets(client: AdminClient, workspaceId: string, options: LoadTargetsOptions = {}): Promise<LoadedTargets> {
  const [own, competitors] = await Promise.all([
    client.from("social_accounts").select("id, handle, platform").eq("workspace_id", workspaceId).order("handle"),
    options.ownOnly
      ? Promise.resolve({ data: [], error: null })
      : client.from("competitors").select("id, handle, platform").eq("workspace_id", workspaceId).eq("status", "tracked").order("handle"),
  ]);
  if (own.error) throw new Error(`Toplama: kendi hesaplar okunamadı (${own.error.message}).`);
  if (competitors.error) throw new Error(`Toplama: rakipler okunamadı (${competitors.error.message}).`);

  const all: CollectTarget[] = [
    ...(own.data ?? []).map((row): CollectTarget => ({ owner: { kind: "own", id: row.id }, handle: row.handle, platform: row.platform })),
    ...(competitors.data ?? []).map(
      (row): CollectTarget => ({ owner: { kind: "competitor", id: row.id }, handle: row.handle, platform: row.platform }),
    ),
  ];
  return {
    targets: all.filter((target) => hasPlatformModule(target.platform)),
    skipped: all.filter((target) => !hasPlatformModule(target.platform)).map((t) => `@${t.handle} (${t.platform})`),
  };
}
