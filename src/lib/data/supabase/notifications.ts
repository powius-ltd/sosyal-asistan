/**
 * Bildirimler + uyarı ayarları. Bildirimi sunucu üretir (tick); kullanıcı yalnız `read_at`'i değiştirir.
 * Uyarı ayarı yaması doğrulaması/birleştirmesi `alert-settings-patch.ts`'tedir (tüm depolarla ortak).
 */
import type { AlertSettings, Notification } from "@/lib/domain/notification";
import { applyAlertSettingsPatch } from "@/lib/data/alert-settings-patch";
import type { AlertSettingsPatch, NotificationFilter, PagedResult } from "@/lib/data/queries";
import { RepositoryError } from "@/lib/data/repository";
import type { Filterable } from "@/lib/data/supabase/content-filters";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { isUuid, unwrap } from "@/lib/data/supabase/errors";
import { planPage, type PageSort } from "@/lib/data/supabase/keyset";
import {
  ALERT_COLUMNS,
  NOTIFICATION_COLUMNS,
  toAlertColumns,
  toAlertSettings,
  toNotification,
  type NotificationRow,
} from "@/lib/data/supabase/mappers/notifications";
import { clampLimit, pageOf } from "@/lib/data/supabase/paging";
import { requireWorkspace } from "@/lib/data/supabase/workspace";

/** Yeniden eskiye; eşitlikte kimlik azalan (mock ile aynı). */
const SORT: PageSort = { tag: "notifications", column: "created_at", nullable: false, cursor: "keyset", idDir: "desc" };

export async function listNotifications(ctx: SupabaseContext, wsId: string, filter: NotificationFilter = {}): Promise<PagedResult<Notification>> {
  if (!isUuid(wsId)) return { items: [], total: 0 };
  const limit = clampLimit(filter.limit);
  const scoped = <Q extends Filterable>(query: Q): Q => (filter.unreadOnly ? query.is("read_at", null) : query);
  const base = () => ctx.db.from("notifications");
  const plan = planPage<NotificationRow>(SORT, filter.cursor, limit);
  const [rows, counted] = await Promise.all([
    plan.apply(scoped(base().select(NOTIFICATION_COLUMNS).eq("workspace_id", wsId))),
    scoped(base().select("id", { count: "exact", head: true }).eq("workspace_id", wsId)),
  ]);
  const data = unwrap(rows);
  if (counted.error) unwrap(counted);
  const page = pageOf<NotificationRow>(data, limit, plan.nextCursor(data), counted.count ?? undefined);
  return { ...page, items: page.items.map(toNotification) };
}

/** Okunmamış bildirim sayısı (zil rozeti). Bilinmeyen workspace → `not_found`. */
export async function countUnreadNotifications(ctx: SupabaseContext, wsId: string): Promise<number> {
  await requireWorkspace(ctx, wsId);
  const { count, error } = await ctx.db.from("notifications").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).is("read_at", null);
  if (error) unwrap({ data: null, error });
  return count ?? 0;
}

/** İdempotent: zaten okunmuşsa ilk okunma zamanı korunur. Yoksa `not_found`. */
export async function markNotificationRead(ctx: SupabaseContext, wsId: string, notificationId: string): Promise<Notification> {
  await requireWorkspace(ctx, wsId);
  const read = () =>
    isUuid(notificationId)
      ? ctx.db.from("notifications").select(NOTIFICATION_COLUMNS).eq("workspace_id", wsId).eq("id", notificationId).maybeSingle()
      : Promise.resolve({ data: null, error: null });
  const current = unwrap(await read());
  if (!current) throw new RepositoryError("not_found", `Bildirim bulunamadı: ${notificationId}`);
  if (current.read_at !== null) return toNotification(current);
  // `read_at is null` koşulu: eşzamanlı iki çağrıdan ilk okunma zamanı korunur.
  unwrap(await ctx.db.from("notifications").update({ read_at: ctx.now().toISOString() }).eq("workspace_id", wsId).eq("id", notificationId).is("read_at", null));
  const after = unwrap(await read());
  if (!after) throw new RepositoryError("not_found", `Bildirim bulunamadı: ${notificationId}`);
  return toNotification(after);
}

/** Tüm okunmamışları okundu yapar; bu çağrıda okundu yapılanların sayısını döndürür (0 geçerli). */
export async function markAllNotificationsRead(ctx: SupabaseContext, wsId: string): Promise<number> {
  await requireWorkspace(ctx, wsId);
  const marked = unwrap(
    await ctx.db.from("notifications").update({ read_at: ctx.now().toISOString() }).eq("workspace_id", wsId).is("read_at", null).select("id"),
  );
  return marked.length;
}

async function readAlertRow(ctx: SupabaseContext, wsId: string) {
  return unwrap(await ctx.db.from("alert_settings").select(ALERT_COLUMNS).eq("workspace_id", wsId).maybeSingle());
}

/** Workspace'in uyarı kuralları ve kanalları (satır yoksa varsayılanlar). SIR yok: yalnız "ayarlı mı" (`chatIdSet`). */
export async function getAlertSettings(ctx: SupabaseContext, wsId: string): Promise<AlertSettings> {
  await requireWorkspace(ctx, wsId);
  return toAlertSettings(await readAlertRow(ctx, wsId));
}

/** Derin kısmi yama: doğrula + mevcut ayarlarla birleştir (çapraz kurallar dahil), sonra tek satır olarak yaz. */
export async function updateAlertSettings(ctx: SupabaseContext, wsId: string, patch: AlertSettingsPatch): Promise<AlertSettings> {
  await requireWorkspace(ctx, wsId);
  const next = applyAlertSettingsPatch(toAlertSettings(await readAlertRow(ctx, wsId)), patch);
  const saved = unwrap(
    await ctx.db.from("alert_settings").upsert({ workspace_id: wsId, ...toAlertColumns(next) }, { onConflict: "workspace_id" }).select(ALERT_COLUMNS).single(),
  );
  return toAlertSettings(saved);
}
