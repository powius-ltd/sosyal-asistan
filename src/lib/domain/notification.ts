/**
 * Bildirimler, uyarı kuralları ve haftalık özet. Tablolar: `alert_settings` (workspace başına bir satır),
 * `notifications` (PLAN.md "Ek özellikler").
 *
 * SIR KURALI: Telegram bot anahtarı, sohbet kimliği, e-posta şifresi/SMTP anahtarı gibi sırlar domain'e HİÇ girmez;
 * bunlar sunucu tarafında (Vault/env) durur. Domain yalnız "ayarlı mı" bilgisini taşır (`chatIdSet`). E-posta ADRESİ
 * sır değildir (kullanıcının kendi adresi).
 */
import type { LiftTier } from "@/lib/domain/content";
import type { ContentSummary } from "@/lib/domain/content-summary";

// ------------------------------------------------------------------ Bildirim

/**
 * competitor_outlier: izlenen rakibin içeriği eşiği geçti · own_outlier: kendi içeriğin eşiği geçti ·
 * weekly_digest: haftalık özet hazır · system: bağlantı/bütçe/rakip durumu gibi sistem olayı ·
 * measurement_due: bir Reels'in D+1/3/7 ölçümü geldi (`contentId` o Reels) · idea_link_suggested: otomatik eşleşme önerisi var
 * (kullanıcı onaylar/reddeder; `contentId` önerilen Reels) · onboarding: başlangıç akışının bir aşaması bitti (hesaba bakış ya da ilk
 * inceleme; tıklanınca `/baslangic`). Son üçü `dedupe_key` ile tekilleştirilir (aynı olay bir kez; başlangıçta anahtar iş kimliğidir).
 */
export type NotificationKind =
  | "competitor_outlier"
  | "own_outlier"
  | "weekly_digest"
  | "system"
  | "measurement_due"
  | "idea_link_suggested"
  | "onboarding";

export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  "competitor_outlier",
  "own_outlier",
  "weekly_digest",
  "system",
  "measurement_due",
  "idea_link_suggested",
  "onboarding",
];

export interface Notification {
  id: string;
  workspaceId: string;
  kind: NotificationKind;
  /** Kısa Türkçe başlık ("@yapayzekaofis'in reel'i 4,2x tuttu"). */
  title: string;
  body: string;
  /** İlgili içerik (`/video/[id]` bağlantısı); sistem/özet bildiriminde olmayabilir. */
  contentId?: string;
  createdAt: string;
  /** undefined = okunmadı. */
  readAt?: string;
}

// -------------------------------------------------------- Uyarı ayarları

/** Uyarı eşiği olabilen lift kademeleri: `LiftTier`'ın 1..4'ü (kademe 0 = baz çizgisinin altı, uyarı sayılmaz). */
export type AlertTier = Exclude<LiftTier, 0>;

export interface OutlierAlertRule {
  enabled: boolean;
  /** Bu kademe ve üstü uyarı üretir (1 = ≥1,5x … 4 = ≥5x). */
  minTier: AlertTier;
}

export interface WeeklyDigestSchedule {
  enabled: boolean;
  /** Haftanın günü: 0 = Pzt … 6 = Paz (`WEEKDAY_LABELS` ile aynı sıra). */
  weekday: number;
  /** Gönderim saati, 0–23 (workspace saat diliminde). */
  hour: number;
}

export interface AlertChannels {
  /** Uygulama içi bildirim her zaman açıktır (kapatılamaz). */
  inApp: true;
  /** E-posta kanalı: adres (sır değil). */
  email?: { enabled: boolean; address?: string };
  /** Telegram kanalı: yalnız sohbetin bağlanıp bağlanmadığı. Kimlik/anahtar domain'e girmez (sunucuda). */
  telegram?: { enabled: boolean; chatIdSet: boolean };
}

export interface AlertSettings {
  competitorOutlier: OutlierAlertRule;
  ownOutlier: OutlierAlertRule;
  weeklyDigest: WeeklyDigestSchedule;
  channels: AlertChannels;
}

/** Kademe seçenekleri (uyarı eşiği): 1..4. */
export const ALERT_MIN_TIERS: readonly AlertTier[] = [1, 2, 3, 4];

/** Yeni workspace'in uyarı ayarları: ≥3x uyarı, Pazartesi 09:00 özet, yalnız uygulama içi kanal. */
export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  competitorOutlier: { enabled: true, minTier: 3 },
  ownOutlier: { enabled: true, minTier: 3 },
  weeklyDigest: { enabled: true, weekday: 0, hour: 9 },
  channels: { inApp: true, email: { enabled: false }, telegram: { enabled: false, chatIdSet: false } },
};

// ------------------------------------------------------------ Haftalık özet

/** Özetteki içerik: içerik özeti + son ölçülen izlenme (ölçülmediyse undefined). */
export interface DigestContent extends ContentSummary {
  views?: number;
}

export type DigestMeasure = "followersDelta" | "views" | "mostActive";

/**
 * `getWeeklyDigest` sonucu: `periodEnd` = çağıranın `now`'ı, `periodStart` = 7 gün önce. Ölçülemeyen değer undefined'dır,
 * 0 DEĞİL (sebep `unmeasuredReasons`'ta); sayaçlar (`ideas`, `posts`) depodan sayılır, sıfır gerçek sıfırdır.
 */
export interface WeeklyDigest {
  periodStart: string;
  periodEnd: string;
  own: {
    /** Dönem sonu − dönem başı takipçi (negatif = kayıp); iki uçta da ölçüm yoksa undefined. */
    followersDelta?: number;
    /** Dönemde kendi içeriklerin kazandığı izlenme; hiçbir içeriğin izlenmesi ölçülmediyse undefined. */
    views?: number;
    /** Dönemde yayınlanan kendi içeriklerden en yüksek lift'liler (en çok 3); yayın yoksa boş. */
    topContent: DigestContent[];
  };
  competitors: {
    /** Dönemde yayınlanan tutan rakip içerikleri (izlenen rakipler; `listOutliers` ile aynı küme), lift'e göre, en çok 5. */
    newOutliers: ContentSummary[];
    /** Dönemde en çok içerik yayınlayan izlenen rakip; dönemde tarihli rakip içeriği yoksa undefined. */
    mostActive?: { competitorId: string; handle: string; posts: number };
  };
  ideas: {
    /** Dönemde oluşturulan fikir sayısı. */
    new: number;
    /**
     * Dönemde güncellenen ve `scripted`/`scheduled`/`published` durumundaki fikir sayısı (durum geçmişi tutulmadığı
     * için "script hazır oldu" yaklaşığı).
     */
    scripted: number;
  };
  /** Ölçülemeyen alanın sebebi (alan doluysa anahtar yoktur). */
  unmeasuredReasons: Partial<Record<DigestMeasure, string>>;
}
