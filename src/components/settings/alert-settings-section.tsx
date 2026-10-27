import { AlertSettingsForm } from "@/components/notifications/alert-settings-form";
import { ALERT_SETTINGS_ANCHOR } from "@/components/notifications/alert-settings-state";
import { SettingsSection } from "@/components/settings/settings-section";
import { getPanelContext } from "@/lib/data";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import type { AlertSettings } from "@/lib/domain/notification";

export interface AlertSettingsSectionProps {
  /** `repo.getAlertSettings(wsId)`; sır içermez (Telegram için yalnız "sohbet bağlı mı"). */
  settings: AlertSettings;
}

/**
 * Ayarlar, "Bildirimler ve uyarılar": rakip/kendi tutan eşiği, haftalık özet zamanı ve kanallar. Bileşen kendi
 * `SettingsSection` kartını çizer; formu istemci yaprağı (`AlertSettingsForm`) yönetir, kayıt `updateAlertSettingsAction`.
 * Async sunucu bileşeni: haftalık özet saati workspace saat diliminde gösterilsin diye workspace'i kendisi okur (prop yok).
 */
export async function AlertSettingsSection({ settings }: AlertSettingsSectionProps) {
  const { repo, wsId } = await getPanelContext();
  const workspace = await repo.getWorkspace(wsId);
  return (
    <div id={ALERT_SETTINGS_ANCHOR} className="scroll-mt-20">
      <SettingsSection title="Bildirimler ve uyarılar" description="Hangi gelişmeler bildirim üretir ve nereye gönderilir.">
        <AlertSettingsForm settings={settings} timeZone={workspace?.timezone ?? DEFAULT_TIMEZONE} />
      </SettingsSection>
    </div>
  );
}
