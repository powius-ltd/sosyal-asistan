/**
 * Zincirin durma bildirimi: `notifications` (tür `system`; yeni tür migration ister, bu pakette migration yok). Aynı durma için bir kez:
 * `dedupe_key` benzersiz indeksi (23505 = "zaten bildirildi", hata değil). Yazan yalnız sunucu (service role).
 */
import "server-only";

import type { ChainStop } from "@/lib/cycle/next";
import { cycleStopNotice } from "@/lib/plain-language";
import type { AdminClient } from "@/lib/supabase/admin";

export interface CycleNoticeDraft {
  title: string;
  body: string;
  dedupeKey: string;
}

/** Bildirim gerekmiyorsa undefined. `weekKey`: bugünün haftası (para onayı haftada bir hatırlatılır). */
export function cycleStopDraft(stop: ChainStop, weekKey: string): CycleNoticeDraft | undefined {
  if (!stop.notify) return undefined;
  if (stop.reason === "needs_approval" && stop.step !== undefined) return { ...cycleStopNotice({ reason: "needs_approval", step: stop.step }), dedupeKey: `cycle:approval:${stop.step}:${weekKey}` };
  if ((stop.reason === "job_failed" || stop.reason === "step_failed") && stop.job !== undefined) {
    return { ...cycleStopNotice({ reason: "job_failed", jobKind: stop.job.kind }), dedupeKey: `cycle:failed:${stop.job.kind}:${stop.job.finishedAt ?? "bilinmiyor"}` };
  }
  return undefined;
}

/** `true` = yeni yazıldı, `false` = aynı durma daha önce bildirilmişti. Başka hata fırlar. */
export async function insertCycleNotice(db: AdminClient, workspaceId: string, draft: CycleNoticeDraft): Promise<boolean> {
  const { error } = await db.from("notifications").insert({ workspace_id: workspaceId, kind: "system", title: draft.title, body: draft.body, content_item_id: null, dedupe_key: draft.dedupeKey });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`Halka bildirimi yazılamadı: ${error.message}`);
}
