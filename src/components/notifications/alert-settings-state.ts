/**
 * Uyarı ayarları formunun durumu (saf modül): `AlertSettings` ⇄ form durumu ⇄ `AlertSettingsPatch`.
 * Doğrulamanın asıl yeri sunucudur (`updateAlertSettingsAction` → `alert-settings-patch.ts`); buradaki kontrol yalnız
 * gereksiz gidiş-dönüşü ve belirgin hatayı erken yakalar. SIR alanı yoktur: Telegram için yalnız açık/kapalı.
 */
import type { AlertSettingsPatch } from "@/lib/data/queries";
import type { AlertSettings, AlertTier } from "@/lib/domain/notification";

/** Ayarlar sayfasındaki uyarı bölümünün bağlantı hedefi (`/ayarlar#uyarilar`; Bildirimler sayfası buraya bağlanır). */
export const ALERT_SETTINGS_ANCHOR = "uyarilar";

export interface AlertFormState {
  competitorEnabled: boolean;
  competitorTier: AlertTier;
  ownEnabled: boolean;
  ownTier: AlertTier;
  digestEnabled: boolean;
  /** 0 = Pzt … 6 = Paz. */
  digestWeekday: number;
  /** 0–23 (workspace saat diliminde). */
  digestHour: number;
  emailEnabled: boolean;
  emailAddress: string;
  telegramEnabled: boolean;
}

export function toFormState(settings: AlertSettings): AlertFormState {
  const { competitorOutlier, ownOutlier, weeklyDigest, channels } = settings;
  return {
    competitorEnabled: competitorOutlier.enabled,
    competitorTier: competitorOutlier.minTier,
    ownEnabled: ownOutlier.enabled,
    ownTier: ownOutlier.minTier,
    digestEnabled: weeklyDigest.enabled,
    digestWeekday: weeklyDigest.weekday,
    digestHour: weeklyDigest.hour,
    emailEnabled: channels.email?.enabled ?? false,
    emailAddress: channels.email?.address ?? "",
    telegramEnabled: channels.telegram?.enabled ?? false,
  };
}

/** `next` alanlarından `saved`dan FARKLI olanları alır; hiç fark yoksa undefined (o grup yamaya girmez). */
function changedOnly<T extends object>(changes: { [K in keyof T]?: T[K] }): T | undefined {
  const entries = Object.entries(changes).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

/**
 * Yalnız DEĞİŞEN alanları içeren yama (`saved`: son kaydedilen durum). Dokunulmayan alan yamada yoktur: örneğin bir
 * eşik değişikliği `telegram.enabled`'ı yeniden göndermez (sohbet sonradan ayrıldıysa ilgisiz bir kayıt `invalid_state`
 * almasın). Boş e-posta adresi "" ile silinir (depo sözleşmesi). Fark yoksa `{}`.
 */
export function toPatch(state: AlertFormState, saved: AlertFormState): AlertSettingsPatch {
  const diff = <K extends keyof AlertFormState, V>(key: K, value: V): V | undefined => (state[key] !== saved[key] ? value : undefined);
  const address = state.emailAddress.trim();

  const competitorOutlier = changedOnly<NonNullable<AlertSettingsPatch["competitorOutlier"]>>({
    enabled: diff("competitorEnabled", state.competitorEnabled),
    minTier: diff("competitorTier", state.competitorTier),
  });
  const ownOutlier = changedOnly<NonNullable<AlertSettingsPatch["ownOutlier"]>>({
    enabled: diff("ownEnabled", state.ownEnabled),
    minTier: diff("ownTier", state.ownTier),
  });
  const weeklyDigest = changedOnly<NonNullable<AlertSettingsPatch["weeklyDigest"]>>({
    enabled: diff("digestEnabled", state.digestEnabled),
    weekday: diff("digestWeekday", state.digestWeekday),
    hour: diff("digestHour", state.digestHour),
  });
  const email = changedOnly<NonNullable<NonNullable<AlertSettingsPatch["channels"]>["email"]>>({
    enabled: diff("emailEnabled", state.emailEnabled),
    address: address !== saved.emailAddress.trim() ? address : undefined,
  });
  const telegram = changedOnly<NonNullable<NonNullable<AlertSettingsPatch["channels"]>["telegram"]>>({
    enabled: diff("telegramEnabled", state.telegramEnabled),
  });
  const channels = changedOnly<NonNullable<AlertSettingsPatch["channels"]>>({ email, telegram });

  return {
    ...(competitorOutlier ? { competitorOutlier } : {}),
    ...(ownOutlier ? { ownOutlier } : {}),
    ...(weeklyDigest ? { weeklyDigest } : {}),
    ...(channels ? { channels } : {}),
  };
}

export function isDirty(current: AlertFormState, saved: AlertFormState): boolean {
  return (Object.keys(current) as (keyof AlertFormState)[]).some((key) => {
    // Adres kırpılarak karşılaştırılır: yalnız boşluk farkı "değişiklik" sayılmaz.
    return key === "emailAddress" ? current.emailAddress.trim() !== saved.emailAddress.trim() : current[key] !== saved[key];
  });
}

export interface AlertFormErrors {
  emailAddress?: string;
}

/** E-posta kanalı açıksa adres dolu olmalı (depo da aynısını uygular; burada kayıttan önce gösterilir). */
export function validateForm(state: AlertFormState): AlertFormErrors {
  if (state.emailEnabled && state.emailAddress.trim() === "") {
    return { emailAddress: "E-posta kanalını açmak için bir adres gir." };
  }
  return {};
}
