"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";

import {
  buildHookHref,
  clearedHookFilters,
  ADS_USED_PARAM,
  HOOK_PARAM,
  HOOK_SORTS,
  HOOK_TIER_OPTIONS,
  hasActiveHookFilters,
  hookSortToParam,
  hookSourceToParam,
  hookTierToParam,
  type HookSource,
  type HookUiState,
} from "@/components/hooks/search-params";
import { LabeledSelect, type SelectOption } from "@/components/common/labeled-select";
import { linkButtonClass } from "@/components/content/link-button";
import { useUrlParams } from "@/components/common/use-url-params";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { HookLibrarySort } from "@/lib/data/queries";
import { AD_ORGANIC_PLAIN } from "@/lib/plain-language-ads";
import { OPENINGS_PLAIN, tierTimes, VS_NORMAL } from "@/lib/plain-language-results";

/** "Filtre yok" seçeneğinin değeri (Select değerleri dizgedir). */
const ALL = "all";

const TIER_OPTIONS: SelectOption[] = [
  { value: ALL, label: OPENINGS_PLAIN.filters.allTiers },
  ...HOOK_TIER_OPTIONS.map((tier) => ({ value: hookTierToParam(tier), label: tierTimes(tier) })),
];

const SOURCE_OPTIONS: SelectOption[] = [
  { value: "all", label: OPENINGS_PLAIN.filters.both },
  { value: "own", label: OPENINGS_PLAIN.filters.own },
  { value: "competitor", label: OPENINGS_PLAIN.filters.rivals },
];

const ADS_OPTIONS: SelectOption[] = [
  { value: ALL, label: AD_ORGANIC_PLAIN.filter.all },
  { value: ADS_USED_PARAM, label: AD_ORGANIC_PLAIN.filter.used },
];

const SORT_LABEL: Record<HookLibrarySort, string> = { lift: VS_NORMAL.sortDesc, recent: OPENINGS_PLAIN.filters.recent };
const SORT_OPTIONS: SelectOption[] = HOOK_SORTS.map((sort) => ({ value: sort, label: SORT_LABEL[sort] }));

interface HookFiltersProps {
  state: HookUiState;
  /** Kütüphanedeki hook türleri (değer = taksonomi anahtarı, etiket = Türkçe ad). */
  typeOptions: SelectOption[];
  /** "Reklamda denenmiş" süzgeci çizilsin mi (yalnız yönetici modunda ve reklam hesabı varken). */
  adsFilter?: boolean;
}

/**
 * Açılış kütüphanesi filtreleri: arama, açılış tarzı, normalinin en az kaç katı, kendi/rakip, sıralama. Durum URL'dedir
 * (`useUrlParams`); her değişiklik sunucuyu yeniden çalıştırır ve sayfalamayı sıfırlar.
 */
export function HookFilters({ state, typeOptions, adsFilter = false }: HookFiltersProps) {
  const { update, pending } = useUrlParams();
  const orUndefined = (value: string) => (value === ALL ? undefined : value);

  // URL'deki tür kütüphanede yoksa (eski bağlantı) seçili değer yine görünsün.
  const types: SelectOption[] = [
    { value: ALL, label: OPENINGS_PLAIN.filters.allTypes },
    ...typeOptions,
    ...(state.hookType && !typeOptions.some((o) => o.value === state.hookType)
      ? [{ value: state.hookType, label: state.hookType }]
      : []),
  ];

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q");
    update({ [HOOK_PARAM.q]: typeof value === "string" ? value.trim() : undefined });
  }

  return (
    <div className="mb-4 flex flex-col gap-3" aria-busy={pending}>
      <form role="search" onSubmit={search} className="flex max-w-md items-end gap-2">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="hook-q" className="text-xs text-muted-foreground">
            {OPENINGS_PLAIN.filters.search}
          </Label>
          {/* `key`: URL değişince (ör. "Filtreleri temizle") alan güncel aramaya döner. */}
          <Input
            className="max-md:min-h-tap"
            key={state.q ?? ""}
            id="hook-q"
            name="q"
            type="search"
            defaultValue={state.q ?? ""}
            placeholder={OPENINGS_PLAIN.filters.placeholder}
            maxLength={100}
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending} className="max-md:min-h-tap">
          <Search data-icon="inline-start" aria-hidden />
          {OPENINGS_PLAIN.filters.searchButton}
        </Button>
      </form>

      <div className="flex flex-wrap items-end gap-3">
        <LabeledSelect
          id="hook-type"
          label={OPENINGS_PLAIN.filters.type}
          value={state.hookType ?? ALL}
          options={types}
          className="w-44"
          onChange={(v) => update({ [HOOK_PARAM.type]: orUndefined(v) })}
        />
        <LabeledSelect
          id="hook-tier"
          label={OPENINGS_PLAIN.filters.tier}
          value={state.minTier === undefined ? ALL : hookTierToParam(state.minTier)}
          options={TIER_OPTIONS}
          className="w-40"
          onChange={(v) => update({ [HOOK_PARAM.tier]: orUndefined(v) })}
        />
        <LabeledSelect
          id="hook-source"
          label={OPENINGS_PLAIN.filters.source}
          value={state.source}
          options={SOURCE_OPTIONS}
          className="w-40"
          onChange={(v) => update({ [HOOK_PARAM.source]: hookSourceToParam(v as HookSource) })}
        />
        {adsFilter ? (
          <LabeledSelect
            id="hook-ads"
            label={AD_ORGANIC_PLAIN.filter.label}
            value={state.adsUsed ? ADS_USED_PARAM : ALL}
            options={ADS_OPTIONS}
            className="w-44"
            onChange={(v) => update({ [HOOK_PARAM.ads]: orUndefined(v) })}
          />
        ) : null}
        <LabeledSelect
          id="hook-sort"
          label={OPENINGS_PLAIN.filters.sort}
          value={state.sort}
          options={SORT_OPTIONS}
          className="w-52"
          onChange={(v) => update({ [HOOK_PARAM.sort]: hookSortToParam(v as HookLibrarySort) })}
        />
        {hasActiveHookFilters(state) ? (
          <Link href={buildHookHref(clearedHookFilters(state))} className={cn(linkButtonClass("ghost", "default"), "max-md:min-h-tap")}>
            Filtreleri temizle
          </Link>
        ) : null}
      </div>
    </div>
  );
}
