/**
 * Döngü bildirimleri: `measurement_due` (bir Reels'in D+1/3/7 ölçümü geldi), `idea_link_suggested` (otomatik eşleşme önerisi) ve
 * `onboarding` (başlangıç işi bitti: `job-runner/finish-notice.ts` yazar).
 * Yinelenmez: her olayın `dedupe_key`'i vardır ve `notifications (workspace_id, dedupe_key)` kısmi benzersiz indeksi ikinci
 * yazımı reddeder (23505 = "zaten bildirildi", hata değil). Yazan yalnız sunucu (service role). Render sırasında yazma YOK.
 */
import "server-only";

import type { MeasurementDue } from "@/lib/domain/outcomes";
import { CHECKPOINT_LABEL } from "@/lib/domain/outcomes";
import type { NotificationKind } from "@/lib/domain/notification";
import { formatDate } from "@/lib/format";
import { loadMeasurementDue } from "@/lib/outcomes/load";
import type { AdminClient } from "@/lib/supabase/admin";

export interface NotificationDraft {
  kind: Extract<NotificationKind, "measurement_due" | "idea_link_suggested" | "onboarding">;
  title: string;
  body: string;
  contentItemId?: string;
  dedupeKey: string;
}

/** Ölçüm bildirimi: aynı (içerik, gün) çifti için bir kez. */
export function measurementDueDraft(item: MeasurementDue): NotificationDraft {
  const label = CHECKPOINT_LABEL[item.day];
  const until = formatDate(item.windowEnd, "UTC") ?? item.windowEnd.slice(0, 10);
  return {
    kind: "measurement_due",
    title: `@${item.ownerHandle} Reels'i: ${label} ölçümü geldi`,
    // Bildirim müşteriye de görünür: komut yok (komut yalnız yönetici çıktısında, `--workspace` ile).
    body: `Ölçüm penceresi ${until} tarihine kadar açık.`,
    contentItemId: item.contentItemId,
    dedupeKey: `measurement_due:${item.contentItemId}:d${item.day}`,
  };
}

/** Öneri bildirimi: aynı (fikir, kısa kod) çifti için bir kez. */
export function ideaLinkSuggestedDraft(input: { ideaId: string; ideaTitle: string; shortcode: string; contentItemId: string; reasons: readonly string[] }): NotificationDraft {
  return {
    kind: "idea_link_suggested",
    title: "Bir Reels'in hangi fikirden çıktığı önerildi",
    body: `“${input.ideaTitle}” fikriyle eşleşti (${input.reasons.join("; ") || "benzerlik"}). Fikir kartından onayla ya da reddet.`,
    contentItemId: input.contentItemId,
    dedupeKey: `idea_link_suggested:${input.ideaId}:${input.shortcode}`,
  };
}

/** Bildirimi yazar. `true` = yeni yazıldı, `false` = aynı olay daha önce bildirilmişti. Başka hata fırlar. */
export async function insertNotification(db: AdminClient, wsId: string, draft: NotificationDraft): Promise<boolean> {
  const { error } = await db.from("notifications").insert({
    workspace_id: wsId,
    kind: draft.kind,
    title: draft.title,
    body: draft.body,
    content_item_id: draft.contentItemId ?? null,
    dedupe_key: draft.dedupeKey,
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`Bildirim yazılamadı: ${error.message}`);
}

export interface DueCheck {
  due: MeasurementDue[];
  /** Bu çağrıda YENİ yazılan bildirim sayısı (daha önce bildirilenler sayılmaz). */
  created: number;
}

/** Ücretsiz kontrol (Apify yok): ölçümü gelen kendi Reels'leri bulur ve bildirimlerini yazar. */
export async function checkMeasurementDue(db: AdminClient, wsId: string, now: Date): Promise<DueCheck> {
  const due = await loadMeasurementDue(db, wsId, now);
  let created = 0;
  for (const item of due) if (await insertNotification(db, wsId, measurementDueDraft(item))) created += 1;
  return { due, created };
}
