"use client";

import { TAP_TARGET } from "@/components/notifications/tap";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { updateAlertSettingsAction } from "@/app/actions/alert-settings";
import {
  DigestScheduleRow,
  EmailChannelRow,
  InAppChannelRow,
  OutlierRuleRow,
  TelegramChannelRow,
} from "@/components/notifications/alert-settings-fields";
import { isDirty, toFormState, toPatch, validateForm, type AlertFormErrors, type AlertFormState } from "@/components/notifications/alert-settings-state";
import { Button } from "@/components/ui/button";
import type { AlertSettings } from "@/lib/domain/notification";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="divide-y">{children}</div>
    </section>
  );
}

export interface AlertSettingsFormProps {
  /** `repo.getAlertSettings(wsId)`; sır içermez (Telegram için yalnız "sohbet bağlı mı"). */
  settings: AlertSettings;
  /** Workspace saat dilimi (haftalık özet saati bu dilimde). */
  timeZone: string;
}

/**
 * Uyarı ayarları formu: rakip/kendi tutan eşiği, haftalık özet zamanı, kanallar. Kayıt sunucuda doğrulanır
 * (`updateAlertSettingsAction`); başarıda toast, hata mesajı sunucudan gelir. Gönderim henüz yok: "Test gönder" devre dışı.
 */
export function AlertSettingsForm({ settings, timeZone }: AlertSettingsFormProps) {
  const [state, setState] = useState<AlertFormState>(() => toFormState(settings));
  const [saved, setSaved] = useState<AlertFormState>(state);
  const [errors, setErrors] = useState<AlertFormErrors>({});
  const [pending, startTransition] = useTransition();
  const chatIdSet = settings.channels.telegram?.chatIdSet ?? false;
  const dirty = isDirty(state, saved);

  function set<K extends keyof AlertFormState>(key: K, value: AlertFormState[K]) {
    setState((current) => ({ ...current, [key]: value }));
    if (key === "emailAddress" || key === "emailEnabled") setErrors({});
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateForm(state);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const snapshot = state;
    startTransition(async () => {
      const result = await updateAlertSettingsAction(toPatch(snapshot, saved));
      if (result.ok) {
        setSaved(snapshot);
        toast.success("Uyarı ayarları kaydedildi.");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <Group title="Tutan içerik uyarıları">
          <OutlierRuleRow
            title="Rakip içeriği tuttu"
            description="İzlediğin bir rakibin videosu normalinin seçtiğin katına ulaşınca bildir."
            enabled={state.competitorEnabled}
            tier={state.competitorTier}
            onEnabledChange={(value) => set("competitorEnabled", value)}
            onTierChange={(value) => set("competitorTier", value)}
          />
          <OutlierRuleRow
            title="Kendi içeriğin tuttu"
            description="Kendi hesaplarındaki bir video normalinin seçtiğin katına ulaşınca bildir."
            enabled={state.ownEnabled}
            tier={state.ownTier}
            onEnabledChange={(value) => set("ownEnabled", value)}
            onTierChange={(value) => set("ownTier", value)}
          />
        </Group>

        <Group title="Haftalık özet">
          <DigestScheduleRow
            enabled={state.digestEnabled}
            weekday={state.digestWeekday}
            hour={state.digestHour}
            timeZone={timeZone}
            onEnabledChange={(value) => set("digestEnabled", value)}
            onWeekdayChange={(value) => set("digestWeekday", value)}
            onHourChange={(value) => set("digestHour", value)}
          />
        </Group>

        <Group title="Kanallar">
          <InAppChannelRow />
          <EmailChannelRow
            enabled={state.emailEnabled}
            address={state.emailAddress}
            error={errors.emailAddress}
            onEnabledChange={(value) => set("emailEnabled", value)}
            onAddressChange={(value) => set("emailAddress", value)}
          />
          <TelegramChannelRow
            enabled={state.telegramEnabled}
            chatIdSet={chatIdSet}
            onEnabledChange={(value) => set("telegramEnabled", value)}
          />
        </Group>
      </fieldset>

      <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        E-posta ve Telegram ile gönderim yakında. Şimdilik uyarılar yalnız uygulama içinde (zil ve Bildirimler) görünür; e-posta ve
        Telegram ayarların kaydedilir ama henüz mesaj gitmez.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || !dirty} className={TAP_TARGET}>
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        <Button type="button" variant="outline" disabled className={TAP_TARGET}>
          Test gönder
        </Button>
      </div>
    </form>
  );
}
