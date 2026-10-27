/**
 * Mock depo: bildirimler, uyarı ayarları ve haftalık özet. Yama doğrulaması `lib/data/alert-settings-patch.ts`'te
 * (tüm depo uygulamalarıyla ortak).
 */
import { applyAlertSettingsPatch } from "@/lib/data/alert-settings-patch";
import type { PanelRepository } from "@/lib/data/repository";
import { filterOutliers, paginate } from "@/lib/data/mock/mock-filters";
import type { MockContext } from "@/lib/data/mock/repos/context";
import { OUTLIER_MIN_TIER } from "@/lib/domain/content";
import { buildWeeklyDigest } from "@/lib/data/views/weekly-digest";

export type NotificationMethods = Pick<
  PanelRepository,
  | "getAlertSettings"
  | "updateAlertSettings"
  | "listNotifications"
  | "countUnreadNotifications"
  | "markNotificationRead"
  | "markAllNotificationsRead"
  | "getWeeklyDigest"
>;

export function createNotificationMethods(ctx: MockContext): NotificationMethods {
  const { state, clock, inWs, requireWs, findOrThrow, out } = ctx;

  return {
    async getAlertSettings(wsId) {
      requireWs(wsId);
      return out(state.alertSettings);
    },

    async updateAlertSettings(wsId, patch) {
      requireWs(wsId);
      // Doğrula + birleştir (çapraz kurallar dahil); hata varsa durum değişmez.
      state.alertSettings = applyAlertSettingsPatch(state.alertSettings, patch);
      return out(state.alertSettings);
    },

    async listNotifications(wsId, filter = {}) {
      if (!inWs(wsId)) return { items: [], total: 0 };
      const list = state.notifications
        .filter((n) => !filter.unreadOnly || n.readAt === undefined)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      return out(paginate(list, filter.limit, filter.cursor));
    },

    async countUnreadNotifications(wsId) {
      requireWs(wsId);
      return state.notifications.filter((n) => n.readAt === undefined).length;
    },

    async markNotificationRead(wsId, notificationId) {
      requireWs(wsId);
      const notification = findOrThrow(state.notifications, notificationId, "Bildirim");
      notification.readAt ??= clock.tick(); // İdempotent: okunmuşsa ilk okunma zamanı korunur.
      return out(notification);
    },

    async markAllNotificationsRead(wsId) {
      requireWs(wsId);
      let marked = 0;
      for (const notification of state.notifications) {
        if (notification.readAt === undefined) {
          notification.readAt = clock.tick();
          marked += 1;
        }
      }
      return marked;
    },

    async getWeeklyDigest(wsId, now) {
      requireWs(wsId);
      return out(
        buildWeeklyDigest(
          {
            own: state.ownAccounts,
            competitors: state.competitors,
            items: state.content,
            // Tutanlar ile aynı süzgeç (izlenen rakipler, kademe ≥ OUTLIER_MIN_TIER, lift'e göre).
            outliers: filterOutliers(state.content, { minTier: OUTLIER_MIN_TIER, sort: "lift" }, state.ownAccounts, state.competitors),
            snapshotsByItem: ctx.snapshotsByItem,
            accountSnapshots: state.accountSnapshots,
            analyses: state.analyses,
            ideas: state.ideas,
          },
          now,
        ),
      );
    },
  };
}
