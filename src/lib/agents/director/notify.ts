/**
 * Ajan bildirimi: `notifications` (tür `system`), zil. Aynı durum için bir kez: `dedupe_key` (gün + eylem + hedef). Ajanın TEK çıktı
 * yüzeyi budur; sohbet emrinde yanıt sohbetten döner, zil yazılmaz. Yazım mantığı halkayla ortaktır (`insertCycleNotice`).
 */
import "server-only";

import { insertCycleNotice } from "@/lib/cycle/notify";
import { agentNotice } from "@/lib/plain-language";
import type { AdminClient } from "@/lib/supabase/admin";

export function agentDedupeKey(action: string, target: string, dayKey: string): string {
  return `agent:${action}:${target}:${dayKey}`;
}

/** `true` = yeni yazıldı, `false` = aynı bildirim bugün zaten vardı. */
export async function writeAgentNotice(db: AdminClient, workspaceId: string, action: "ask_approval" | "notify", target: string, dayKey: string, message?: string): Promise<boolean> {
  return insertCycleNotice(db, workspaceId, { ...agentNotice(action, message), dedupeKey: agentDedupeKey(action, target, dayKey) });
}
