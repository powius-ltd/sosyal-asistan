import { Compass, Info, Link2, Newspaper, Timer, Trophy, TrendingUp, type LucideIcon } from "lucide-react";

import type { NotificationKind } from "@/lib/domain/notification";
import { ROUTES } from "@/lib/routes";

export interface NotificationKindMeta {
  label: string;
  icon: LucideIcon;
  /** Bildirimin asıl işi başka bir ekranda: satırda bu bağlantı gösterilir (içerik bağlantısından ayrı). */
  action?: { href: string; label: string };
}

/** Bildirim türü → Türkçe etiket + ikon (Genel bakış kartı ve `/bildirimler` listesi ortak kullanır). */
export const NOTIFICATION_KIND_META: Record<NotificationKind, NotificationKindMeta> = {
  competitor_outlier: { label: "Rakip tutan içerik", icon: TrendingUp },
  own_outlier: { label: "Kendi içeriğin tuttu", icon: Trophy },
  weekly_digest: { label: "Haftalık özet", icon: Newspaper },
  system: { label: "Sistem", icon: Info },
  // Reels'in 1./3./7. gün ölçümü geldi: ölçüm komutu Bu hafta ekranındaki şeritte yazılıdır.
  measurement_due: { label: "Reels ölçümü zamanı", icon: Timer, action: { href: ROUTES.thisWeek, label: "Bu hafta'da gör" } },
  // Otomatik eşleşme önerisi: karar (onayla/reddet) fikir kartındadır.
  idea_link_suggested: { label: "Fikir ↔ Reels eşleşme önerisi", icon: Link2, action: { href: ROUTES.ideas, label: "Fikirlerde karar ver" } },
  // Başlangıç akışının bir aşaması bitti (hesaba bakış ya da ilk inceleme): sonuç ve sıradaki adım akış ekranındadır.
  onboarding: { label: "İlk bakış", icon: Compass, action: { href: ROUTES.onboarding, label: "Aç" } },
};
