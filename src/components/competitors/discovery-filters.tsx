"use client";

import {
  DISCOVERY_PARAM,
  DISCOVERY_SOURCES,
  type DiscoverySource,
  type DiscoveryUiState,
} from "@/components/competitors/discovery-params";
import { LabeledSelect, type SelectOption } from "@/components/common/labeled-select";
import { useUrlParams } from "@/components/common/use-url-params";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const ALL = "all";

const SOURCE_OPTIONS: SelectOption[] = [
  { value: ALL, label: "Tüm kaynaklar" },
  { value: "related", label: "Platform önerisi" },
  { value: "search", label: "Arama" },
];

/** Keşfet filtreleri: kaynak + "yalnız benzer boy". Durum URL'de tutulur. */
export function DiscoveryFilters({ state }: { state: DiscoveryUiState }) {
  const { update, pending } = useUrlParams();

  return (
    <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3" aria-busy={pending}>
      <LabeledSelect
        id="discovery-source"
        label="Kaynak"
        value={state.source ?? ALL}
        options={SOURCE_OPTIONS}
        className="w-44"
        onChange={(value) =>
          update({ [DISCOVERY_PARAM.source]: DISCOVERY_SOURCES.includes(value as DiscoverySource) ? value : undefined })
        }
      />

      <Label className="h-8 cursor-pointer font-normal">
        <Switch
          size="sm"
          checked={state.similarSizeOnly}
          onCheckedChange={(checked) => update({ [DISCOVERY_PARAM.similar]: checked ? "1" : undefined })}
        />
        Yalnız benzer boy
      </Label>
    </div>
  );
}
