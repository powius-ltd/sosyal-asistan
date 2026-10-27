/**
 * Supabase deposunun ortak bağlamı: service role istemcisi, Faz 1 yerel kullanıcı ve saat.
 * Depo (`PanelRepository`) HER sorguyu açıkça `workspace_id` ile süzer; service role RLS'yi aşar, yetki denetimi burada.
 */
import { JOB_QUEUE_DEFAULT } from "@/lib/domain/panel-job";
import type { AdminClient } from "@/lib/supabase/admin";

export interface SupabaseContext {
  db: AdminClient;
  /**
   * Yayın onayını yazan kullanıcı (`publish_jobs.approved_by`). Faz 1'de giriş ekranı yok: yerel tek kullanıcı
   * (`LOCAL_USER_ID`, seed'de workspace sahibi). Faz 3.5'te oturumdaki kullanıcı olur.
   */
  approverUserId: string;
  /**
   * Kredi hesabının sahibi (`credit_accounts.owner_user_id`). Kredi kullanıcıya aittir: giriş gelene kadar yerel tek kullanıcı, tüm çalışma
   * alanları onun bakiyesinden yer; sonra oturumdaki kullanıcı olur. Testler KENDİ kullanıcısını verir (gerçek bakiyeye yazılmaz).
   */
  creditOwnerUserId: string;
  /** Şimdiki an (testte sabitlenebilir). `getPanelContext().now` almayan metotlarda (ör. `getOverview`) bu kullanılır. */
  now(): Date;
  /**
   * Yeni panel işlerinin yazıldığı kuyruk (`panel_jobs.queue`). Panel her zaman `JOB_QUEUE_DEFAULT` kullanır (canlı işçinin aldığı kuyruk);
   * testler KENDİ kuyruk adını verir. Girdiden gelmez: istemci kuyruk seçemez.
   */
  jobQueue: string;
  /**
   * Kredi zorlaması açık mı (`CREDITS_ENFORCED`; okuma `lib/credits/enforcement.ts`). Açıkken iş isteği kredi ayırır (yetmezse iş açılmaz);
   * kapalıyken (varsayılan) hiçbir iş krediye bağlanmaz. Testler iki modu da açıkça verir.
   */
  creditsEnforced: boolean;
}

export interface SupabaseRepositoryOptions {
  db: AdminClient;
  approverUserId: string;
  /** Varsayılan `approverUserId`. */
  creditOwnerUserId?: string;
  now?: () => Date;
  /** Varsayılan `JOB_QUEUE_DEFAULT`. */
  jobQueue?: string;
  /** Varsayılan false (zorlama kapalı). */
  creditsEnforced?: boolean;
}

export function createContext(options: SupabaseRepositoryOptions): SupabaseContext {
  return {
    db: options.db,
    approverUserId: options.approverUserId,
    creditOwnerUserId: options.creditOwnerUserId ?? options.approverUserId,
    now: options.now ?? (() => new Date()),
    jobQueue: options.jobQueue ?? JOB_QUEUE_DEFAULT,
    creditsEnforced: options.creditsEnforced ?? false,
  };
}
