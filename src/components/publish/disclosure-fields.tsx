"use client";

import { useId, type ReactNode } from "react";

import { TRIAL_GRADUATION_OPTION_LABEL } from "@/components/publish/publish-labels";
import type { PublishFlags } from "@/components/publish/publish-flags";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ADVERTISER_NAME_MAX, TRIAL_GRADUATIONS } from "@/lib/domain/publish";
import { TRIAL_PLAIN } from "@/lib/plain-language-publish";

const graduationItems = TRIAL_GRADUATIONS.map((value) => ({ value, label: TRIAL_GRADUATION_OPTION_LABEL[value] }));

/** Başlık + açıklama solda, anahtar sağda; satırın her yeri tıklanabilir (etiket anahtara bağlıdır). */
function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <label className="flex min-h-tap items-start justify-between gap-3 md:min-h-0">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span id={labelId} className="text-sm font-medium">
          {label}
        </span>
        <span id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        className="mt-0.5"
      />
    </label>
  );
}

function Nested({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5 border-l-2 pl-3">{children}</div>;
}

interface DisclosureFieldsProps {
  value: PublishFlags;
  onChange: (patch: Partial<PublishFlags>) => void;
  disabled?: boolean;
}

/**
 * Yeni yayın formunun uyum ve yayın türü alanları: ücretli iş birliği (+ reklam veren), yapay zekâ beyanı ve deneme
 * yayını (+ takipçilere açılma). Denetim `CompliancePanel`'de canlı görünür; buradaki değerler sunucuda yeniden doğrulanır.
 */
export function DisclosureFields({ value, onChange, disabled = false }: DisclosureFieldsProps) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Uyum ve yayın türü</legend>

      <SwitchRow
        label="Ücretli iş birliği"
        description="Reklam ya da sponsorluk içeriğinde açıklamanın başında ibare gerekir."
        checked={value.paidPartnership}
        onCheckedChange={(paidPartnership) => onChange({ paidPartnership })}
      />
      {value.paidPartnership ? (
        <Nested>
          <Label htmlFor="pj-advertiser">Reklam veren</Label>
          <Input
            id="pj-advertiser"
            value={value.advertiserName}
            onChange={(event) => onChange({ advertiserName: event.target.value })}
            maxLength={ADVERTISER_NAME_MAX}
            placeholder="Marka ya da firma adı"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">Açıklamada da görünmesi beklenir (ör. “@marka tarafından sağlandı”).</p>
        </Nested>
      ) : null}

      <SwitchRow
        label="Yapay zekâ ile üretildi"
        description="Karakter ya da içerik yapay zekâ ile üretildiyse açık bir beyan gerekir."
        checked={value.aiGenerated}
        onCheckedChange={(aiGenerated) => onChange({ aiGenerated })}
      />

      <SwitchRow
        label={TRIAL_PLAIN.name}
        description={TRIAL_PLAIN.description}
        checked={value.trialEnabled}
        onCheckedChange={(trialEnabled) => onChange({ trialEnabled })}
      />
      {value.trialEnabled ? (
        <Nested>
          <Label htmlFor="pj-trial-graduation">{TRIAL_PLAIN.graduationLabel}</Label>
          <Select
            items={graduationItems}
            value={value.trialGraduation}
            onValueChange={(next) => {
              const graduation = TRIAL_GRADUATIONS.find((option) => option === next);
              if (graduation) onChange({ trialGraduation: graduation });
            }}
          >
            <SelectTrigger id="pj-trial-graduation" className="w-full min-h-tap md:min-h-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {graduationItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{TRIAL_PLAIN.graduationNote}</p>
        </Nested>
      ) : null}
    </fieldset>
  );
}
