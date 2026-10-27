/**
 * Betik başı bakımı (`analyze:now` ve `plan:week` koşu başında; zamanlayıcı (cron) gelene kadar):
 *  1. Süresi dolan rakip transcript'inin metni/segmentleri silinir (`purge_expired_transcripts`, 0003; 90 gün saklama kuralı).
 *  2. Betik öldürülürse (Ctrl+C, çökme) kapanmadan kalan abonelik koşu satırları (`reserved`/`running`, `billing = 'subscription'`)
 *     belirli bir süreden eskiyse `failed` yapılır (sebep yazılır); aksi halde "çalışıyor" görünür ve maliyet kartını kirletir.
 * Hata koşuyu durdurmaz ama sessiz kalmaz: günlüğe uyarı yazılır (saklama ihlali okumada ayrıca süzülür: `expires_at` süzgeci).
 */
import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";

/** Bu süreden eski açık abonelik koşusu ölü sayılır (tek agy çağrısı en çok ~8 dk sürer; 2 saat bol pay). */
export const STALE_RUN_MS = 2 * 60 * 60 * 1000;

/** Silinen (boşaltılan) transcript sayısı; RPC başarısızsa hata fırlatır. */
export async function purgeExpiredTranscripts(client: AdminClient, now: Date): Promise<number> {
  const { data, error } = await client.rpc("purge_expired_transcripts", { p_now: now.toISOString() });
  if (error) throw new Error(`Süresi dolan transcript temizlenemedi: ${error.message}`);
  return data ?? 0;
}

/** Kapanmamış eski abonelik koşularını `failed` yapar; kapatılan satır sayısını döndürür. */
export async function failStaleSubscriptionRuns(client: AdminClient, workspaceId: string, now: Date, maxAgeMs: number = STALE_RUN_MS): Promise<number> {
  const cutoff = new Date(now.getTime() - maxAgeMs).toISOString();
  const { data, error } = await client
    .from("collection_runs")
    .update({ status: "failed", error: `Betik durduruldu ya da çöktü: koşu ${Math.round(maxAgeMs / 3_600_000)} saatten uzun süredir kapanmadı.`, finished_at: now.toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("billing", "subscription")
    .in("status", ["reserved", "running"])
    .lt("started_at", cutoff)
    .select("id");
  if (error) throw new Error(`Eski abonelik koşuları kapatılamadı: ${error.message}`);
  return data?.length ?? 0;
}

export interface HousekeepingContext {
  client: AdminClient;
  workspaceId: string;
  now: Date;
}

export async function runHousekeeping(ctx: HousekeepingContext, log: (line: string) => void): Promise<void> {
  const step = async (what: string, run: () => Promise<string | undefined>) => {
    try {
      const message = await run();
      if (message !== undefined) log(message);
    } catch (error) {
      log(`Uyarı: ${what} başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    }
  };
  await step("transcript temizliği", async () => {
    const purged = await purgeExpiredTranscripts(ctx.client, ctx.now);
    return purged > 0 ? `Saklama süresi dolan ${purged} transcript'in metni silindi.` : undefined;
  });
  await step("eski koşu kapatma", async () => {
    const closed = await failStaleSubscriptionRuns(ctx.client, ctx.workspaceId, ctx.now);
    return closed > 0 ? `Kapanmadan kalmış ${closed} abonelik koşusu başarısız olarak işaretlendi.` : undefined;
  });
}
