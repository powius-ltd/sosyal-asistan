"use client";

import type { CollectionOption } from "@/components/collections/collection-option";
import { Checkbox } from "@/components/ui/checkbox";

interface CollectionChecklistProps {
  options: CollectionOption[];
  /** İçeriğin üye olduğu koleksiyon kimlikleri. */
  memberIds: string[];
  /** Bir işlem sürerken satırlar kilitlenir (yarış olmasın). */
  disabled: boolean;
  onToggle: (option: CollectionOption, checked: boolean) => void;
}

/** "Kaydet" menüsündeki koleksiyon listesi: işaretli = içerik bu koleksiyonda; tıklayınca ekler/çıkarır. */
export function CollectionChecklist({ options, memberIds, disabled, onToggle }: CollectionChecklistProps) {
  if (options.length === 0) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">Henüz koleksiyon yok. Aşağıdan ilkini oluştur.</p>;
  }
  return (
    <ul role="group" aria-label="Koleksiyonlar" className="flex max-h-52 flex-col overflow-y-auto">
      {options.map((option) => (
        <li key={option.id}>
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted max-md:min-h-tap">
            <Checkbox
              checked={memberIds.includes(option.id)}
              disabled={disabled}
              onCheckedChange={(checked) => onToggle(option, checked)}
            />
            <span className="min-w-0 flex-1 truncate">{option.name}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
