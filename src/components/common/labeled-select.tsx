"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Açılır listenin bir seçeneği (Select değerleri dizgedir). */
export interface SelectOption {
  value: string;
  label: string;
  /** Seçilemez (ör. "yakında" platformu); listede görünür, etiketi nedenini söyler. */
  disabled?: boolean;
}

export interface LabeledSelectProps {
  /** Erişilebilir ad; `hideLabel` değilse üstte görünen etiket de budur. */
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /** Tetikleyici sınıfı (genişlik gibi). */
  className?: string;
  disabled?: boolean;
  /** Tetikleyici kimliği (etiket `htmlFor` ile bağlanır); verilmezse üretilir. */
  id?: string;
  /** Etiketi görsel olarak çizme: yalnız `aria-label` (ayar satırı gibi başlığı zaten yanında olan yerler). */
  hideLabel?: boolean;
}

/**
 * Etiketli açılır liste: filtre çubukları (İçerikler, Tutanlar, Hook kütüphanesi, Keşfet) ve ayar satırları AYNI
 * bileşeni kullanır. Görünür etiket `<Label htmlFor>` ile tetikleyiciye bağlıdır; tetikleyicinin `aria-label`'ı her
 * durumda etikettir. Seçimi üst bileşen yönetir (çoğu yerde URL'ye yazar).
 */
export function LabeledSelect({ label, value, options, onChange, className, disabled, id, hideLabel = false }: LabeledSelectProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;

  const select = (
    <Select
      value={value}
      items={options}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger id={triggerId} aria-label={label} className={cn("max-md:min-h-tap", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled} className="max-md:min-h-11">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  if (hideLabel) return select;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={triggerId} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {select}
    </div>
  );
}
