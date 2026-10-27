"use client";

import { LabeledSelect, type SelectOption } from "@/components/common/labeled-select";
import { useUrlParams } from "@/components/common/use-url-params";
import {
  DAY_OPTIONS,
  MIN_TIER_OPTIONS,
  OUTLIER_PARAM,
  SORT_OPTIONS,
  tierToParam,
  type OutlierUiState,
} from "@/components/outliers/search-params";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { OutlierSort } from "@/lib/data/queries";
import { CONTENT_FORMATS, FORMAT_LABEL } from "@/lib/domain/platform";
import { OUTLIERS_PLAIN } from "@/lib/plain-language-results";

const ALL = "all";

const SORT_LABEL: Record<OutlierSort, string> = OUTLIERS_PLAIN.sort;

const FORMAT_ITEMS: SelectOption[] = [
  { value: ALL, label: "Tüm biçimler" },
  ...CONTENT_FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f] })),
];
const TIER_ITEMS: SelectOption[] = MIN_TIER_OPTIONS.map((tier) => ({
  value: tierToParam(tier),
  label: OUTLIERS_PLAIN.tierOption(tier),
}));
const DAY_ITEMS: SelectOption[] = [
  { value: ALL, label: "Tüm zamanlar" },
  ...DAY_OPTIONS.map((d) => ({ value: String(d), label: `Son ${d} gün` })),
];
const SORT_ITEMS: SelectOption[] = SORT_OPTIONS.map((s) => ({ value: s, label: SORT_LABEL[s] }));

function FilterSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Label className="min-h-tap cursor-pointer font-normal md:min-h-8">
      <Switch size="sm" checked={checked} onCheckedChange={onChange} />
      {label}
    </Label>
  );
}

/**
 * Tutan içerik filtreleri. Değerler sunucudan gelen URL durumundan okunur; değişiklik URL'ye yazılır. `platformOptions` sunucuda
 * kurulur (`platformFilterOptions`: modülü olmayan platform "yakında" ve seçilemez).
 */
export function OutlierFilters({ state, platformOptions }: { state: OutlierUiState; platformOptions: SelectOption[] }) {
  const { update, pending } = useUrlParams();
  const orUndefined = (value: string) => (value === ALL ? undefined : value);

  return (
    <div className="mb-4 flex flex-col gap-3" aria-busy={pending}>
      <div className="flex flex-wrap items-end gap-3">
        <LabeledSelect
          id="outlier-platform"
          label={OUTLIERS_PLAIN.filters.platform}
          value={state.platform ?? ALL}
          options={platformOptions}
          className="w-40"
          onChange={(v) => update({ [OUTLIER_PARAM.platform]: orUndefined(v) })}
        />
        <LabeledSelect
          id="outlier-format"
          label={OUTLIERS_PLAIN.filters.format}
          value={state.format ?? ALL}
          options={FORMAT_ITEMS}
          className="w-36"
          onChange={(v) => update({ [OUTLIER_PARAM.format]: orUndefined(v) })}
        />
        <LabeledSelect
          id="outlier-tier"
          label={OUTLIERS_PLAIN.filters.tier}
          value={tierToParam(state.minTier)}
          options={TIER_ITEMS}
          className="w-36"
          onChange={(v) => update({ [OUTLIER_PARAM.minLift]: v })}
        />
        <LabeledSelect
          id="outlier-days"
          label={OUTLIERS_PLAIN.filters.days}
          value={state.days ? String(state.days) : ALL}
          options={DAY_ITEMS}
          className="w-36"
          onChange={(v) => update({ [OUTLIER_PARAM.days]: orUndefined(v) })}
        />
        <LabeledSelect
          id="outlier-sort"
          label={OUTLIERS_PLAIN.filters.sort}
          value={state.sort}
          options={SORT_ITEMS}
          className="w-56"
          onChange={(v) => update({ [OUTLIER_PARAM.sort]: v })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <FilterSwitch
          label={OUTLIERS_PLAIN.filters.similar}
          checked={state.similar}
          onChange={(c) => update({ [OUTLIER_PARAM.similar]: c ? "1" : undefined })}
        />
        <FilterSwitch
          label={OUTLIERS_PLAIN.filters.lowConfidence}
          checked={state.hideLowConfidence}
          onChange={(c) => update({ [OUTLIER_PARAM.reliable]: c ? "1" : undefined })}
        />
        <FilterSwitch
          label={OUTLIERS_PLAIN.filters.immature}
          checked={state.hideImmature}
          onChange={(c) => update({ [OUTLIER_PARAM.mature]: c ? "1" : undefined })}
        />
      </div>
    </div>
  );
}
