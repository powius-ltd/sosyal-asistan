"use client";

import { TAP_TARGET } from "@/components/notifications/tap";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateComplianceRegion } from "@/app/actions/compliance-settings";
import { REGION_DESCRIPTION, REGION_OPTION_LABEL } from "@/components/publish/publish-labels";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMPLIANCE_REGIONS, type ComplianceRegion } from "@/lib/domain/compliance";

export interface ComplianceRegionFieldProps {
  /** `workspace.complianceRegion` (kayıtlı değer). */
  region: ComplianceRegion;
}

const items = COMPLIANCE_REGIONS.map((value) => ({ value, label: REGION_OPTION_LABEL[value] }));

/**
 * Ayarlar, "Uyum bölgesi": yayın açıklamalarının hangi ülkenin ücretli iş birliği ve yapay zekâ beyanı kurallarına
 * göre denetleneceği. Kayıt sunucuda doğrulanır (`updateComplianceRegion`); başarıda toast, hatada sunucu mesajı.
 */
export function ComplianceRegionField({ region }: ComplianceRegionFieldProps) {
  const [value, setValue] = useState<ComplianceRegion>(region);
  const [pending, startTransition] = useTransition();
  const dirty = value !== region;

  function save() {
    startTransition(async () => {
      const result = await updateComplianceRegion({ complianceRegion: value });
      if (result.ok) toast.success("Uyum bölgesi kaydedildi.");
      else toast.error(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="compliance-region-field">
      <Label htmlFor="ws-compliance-region">Uyum bölgesi</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={items}
          value={value}
          disabled={pending}
          onValueChange={(next) => {
            const selected = COMPLIANCE_REGIONS.find((option) => option === next);
            if (selected) setValue(selected);
          }}
        >
          <SelectTrigger id="ws-compliance-region" className="w-52 min-h-tap md:min-h-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="secondary" disabled={!dirty || pending} onClick={save} className={TAP_TARGET}>
          {pending ? "Kaydediliyor…" : "Bölgeyi kaydet"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{REGION_DESCRIPTION[value]}</p>
      <p className="text-xs text-muted-foreground">
        Kurallara uymayan yayın işi onaya gönderilemez ve onaylanamaz. Kural tabanlı ön kontroldür; hukuki tavsiye değildir.
      </p>
    </div>
  );
}
