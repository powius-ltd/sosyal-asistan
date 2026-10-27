/**
 * Toplama (`collect:now`, `measure:now`) sonrası döngü işleri, sırayla: (1) içerik bekleyen fikir ↔ Reels bağlarını çöz →
 * (2) yeni Reels için eşleşme ÖNERİSİ üret (yalnız `suggested`) → (3) ölçümü gelen Reels için `measurement_due` bildirimi.
 * Hiçbiri para harcamaz (Apify yok). Bir adım düşerse diğerleri sürer; hata özete not olarak yazılır, tur fırlatmaz.
 */
import "server-only";

import { resolveAwaitingLinks } from "@/lib/collection/resolve-links";
import { suggestLinks } from "@/lib/collection/suggest-links";
import { checkMeasurementDue } from "@/lib/outcomes/notify";
import type { AdminClient } from "@/lib/supabase/admin";

export interface AfterCollectSummary {
  /** İçerik bekleyen bağlardan onaylanan. */
  resolved: number;
  /** Yazılan yeni öneri (`suggested`) ve bunların bildirimi. */
  suggested: number;
  suggestionNotifications: number;
  /** Ölçüm penceresi açık Reels sayısı ve bu çağrıda YENİ yazılan bildirim sayısı (yinelenmez). */
  dueCount: number;
  dueNotifications: number;
  notes: string[];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "bilinmeyen hata";
}

export async function afterCollect(client: AdminClient, workspaceId: string, now: Date): Promise<AfterCollectSummary> {
  const summary: AfterCollectSummary = { resolved: 0, suggested: 0, suggestionNotifications: 0, dueCount: 0, dueNotifications: 0, notes: [] };

  try {
    const resolved = await resolveAwaitingLinks(client, workspaceId);
    summary.resolved = resolved.resolved;
    summary.notes.push(...resolved.notes);
  } catch (error) {
    summary.notes.push(`Bekleyen bağlar çözülemedi: ${messageOf(error)}`);
  }

  try {
    const suggestions = await suggestLinks(client, workspaceId, now);
    summary.suggested = suggestions.suggested;
    summary.suggestionNotifications = suggestions.notified;
    summary.notes.push(...suggestions.notes);
  } catch (error) {
    summary.notes.push(`Eşleşme önerisi üretilemedi: ${messageOf(error)}`);
  }

  try {
    const check = await checkMeasurementDue(client, workspaceId, now);
    summary.dueCount = check.due.length;
    summary.dueNotifications = check.created;
  } catch (error) {
    summary.notes.push(`Ölçüm kontrolü yapılamadı: ${messageOf(error)}`);
  }
  return summary;
}
