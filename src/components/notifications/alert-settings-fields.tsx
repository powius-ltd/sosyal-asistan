"use client";

import type { ReactNode } from "react";

import { LabeledSelect, type SelectOption } from "@/components/common/labeled-select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LIFT_TIER_MIN } from "@/lib/domain/content";
import { ALERT_MIN_TIERS, type AlertTier } from "@/lib/domain/notification";
import { formatDecimal } from "@/lib/format";
import { timeZonePlain } from "@/lib/plain-language-account";
import { TAP_TARGET } from "@/components/notifications/tap";
import { hourLabel, WEEKDAY_NAMES } from "@/lib/time";
import { cn } from "@/lib/utils";

const TIER_ITEMS: SelectOption[] = ALERT_MIN_TIERS.map((tier) => ({ value: String(tier), label: `normalinin ${formatDecimal(LIFT_TIER_MIN[tier], LIFT_TIER_MIN[tier] % 1 === 0 ? 0 : 1)} katı ve üstü` }));
const WEEKDAY_ITEMS: SelectOption[] = WEEKDAY_NAMES.map((name, index) => ({ value: String(index), label: name }));
const HOUR_ITEMS: SelectOption[] = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: hourLabel(hour) }));

/** Ayar satırı: solda başlık + açıklama, sağda denetimler. */
function Row({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium">{title}</p>
        {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/** Tutan içerik uyarısı: aç/kapat + en az kaç katı (normalinin 1,5 / 2 / 3 / 5 katı ve üstü). */
export function OutlierRuleRow(props: {
  title: string;
  description: string;
  enabled: boolean;
  tier: AlertTier;
  onEnabledChange: (enabled: boolean) => void;
  onTierChange: (tier: AlertTier) => void;
}) {
  return (
    <Row title={props.title} description={props.description}>
      <Switch aria-label={props.title} checked={props.enabled} onCheckedChange={props.onEnabledChange} />
      <LabeledSelect
        hideLabel
        label={`${props.title}: en az kaç katı`}
        value={String(props.tier)}
        options={TIER_ITEMS}
        disabled={!props.enabled}
        className={cn("w-52", TAP_TARGET)}
        onChange={(value) => props.onTierChange(Number(value) as AlertTier)}
      />
    </Row>
  );
}

/** Haftalık özet: aç/kapat + gün + saat (workspace saat diliminde). */
export function DigestScheduleRow(props: {
  enabled: boolean;
  weekday: number;
  hour: number;
  timeZone: string;
  onEnabledChange: (enabled: boolean) => void;
  onWeekdayChange: (weekday: number) => void;
  onHourChange: (hour: number) => void;
}) {
  return (
    <Row title="Her hafta gönder" description={`Seçtiğin gün ve saatte gönderilir · saat dilimi: ${timeZonePlain(props.timeZone)}`}>
      <Switch aria-label="Haftalık özet" checked={props.enabled} onCheckedChange={props.onEnabledChange} />
      <LabeledSelect
        hideLabel
        label="Haftalık özet günü"
        value={String(props.weekday)}
        options={WEEKDAY_ITEMS}
        disabled={!props.enabled}
        className={cn("w-52", TAP_TARGET)}
        onChange={(value) => props.onWeekdayChange(Number(value))}
      />
      <LabeledSelect
        hideLabel
        label="Haftalık özet saati"
        value={String(props.hour)}
        options={HOUR_ITEMS}
        disabled={!props.enabled}
        className={cn("w-28", TAP_TARGET)}
        onChange={(value) => props.onHourChange(Number(value))}
      />
    </Row>
  );
}

/** Uygulama içi kanal: her zaman açık (kapatılamaz). */
export function InAppChannelRow() {
  return (
    <Row title="Uygulama içi" description="Zil simgesi ve Bildirimler sayfası. Her zaman açıktır.">
      <Badge variant="secondary">Her zaman açık</Badge>
    </Row>
  );
}

/** E-posta kanalı: aç/kapat + adres (adres sır değildir). */
export function EmailChannelRow(props: {
  enabled: boolean;
  address: string;
  error?: string;
  onEnabledChange: (enabled: boolean) => void;
  onAddressChange: (address: string) => void;
}) {
  return (
    <Row
      title="E-posta"
      description={
        props.error ? (
          <span role="alert" className="text-destructive">
            {props.error}
          </span>
        ) : (
          "Uyarılar ve haftalık özet bu adrese gönderilir."
        )
      }
    >
      <Switch aria-label="E-posta" checked={props.enabled} onCheckedChange={props.onEnabledChange} />
      <Input
        type="email"
        inputMode="email"
        autoComplete="email"
        aria-label="E-posta adresi"
        aria-invalid={props.error !== undefined}
        placeholder="ad@ornek.com"
        value={props.address}
        onChange={(event) => props.onAddressChange(event.target.value)}
        className={cn("w-64", TAP_TARGET)}
      />
    </Row>
  );
}

/**
 * Telegram kanalı: aç/kapat + "sohbet bağlı mı" DURUMU. Sohbet kimliği/bot anahtarı arayüze hiç girmez (sunucuda,
 * Vault); sohbet bağlı değilse kanal açılamaz.
 */
export function TelegramChannelRow(props: { enabled: boolean; chatIdSet: boolean; onEnabledChange: (enabled: boolean) => void }) {
  return (
    <Row
      title="Telegram"
      description={
        props.chatIdSet
          ? "Uyarılar bağlı Telegram sohbetine gönderilir."
          : "Sohbet bağlı değil. Bağlama sunucu tarafında yapılır; bağlanınca kanalı buradan açabilirsin."
      }
    >
      <Badge variant={props.chatIdSet ? "secondary" : "outline"}>{props.chatIdSet ? "Sohbet bağlı" : "Sohbet bağlı değil"}</Badge>
      <Switch
        aria-label="Telegram"
        checked={props.enabled}
        disabled={!props.chatIdSet && !props.enabled}
        onCheckedChange={props.onEnabledChange}
      />
    </Row>
  );
}
