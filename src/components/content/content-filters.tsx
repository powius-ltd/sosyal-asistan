"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { LabeledSelect, type SelectOption } from "@/components/common/labeled-select";
import {
  clearedFilters,
  contentHref,
  DATE_RANGE_DAYS,
  hasActiveFilters,
  SORT_KEYS,
  SORT_LABEL,
  withFilters,
  type ContentQuery,
  type DateRangeDays,
  type SortKey,
} from "@/components/content/content-query";
import { linkButtonClass } from "@/components/content/link-button";
import { CONTENT_FORMATS, FORMAT_LABEL, type ContentFormat } from "@/lib/domain/platform";
import { cn } from "@/lib/utils";

/** "Filtre yok" seçeneğinin değeri (Select değerleri dizgedir). */
const ALL = "all";

const FORMAT_OPTIONS: SelectOption[] = [
  { value: ALL, label: "Tüm formatlar" },
  ...CONTENT_FORMATS.map((format) => ({ value: format, label: FORMAT_LABEL[format] })),
];

const RANGE_OPTIONS: SelectOption[] = [
  { value: ALL, label: "Tüm zamanlar" },
  ...DATE_RANGE_DAYS.map((days) => ({ value: String(days), label: `Son ${days} gün` })),
];

const SORT_OPTIONS: SelectOption[] = SORT_KEYS.map((key) => ({ value: key, label: SORT_LABEL[key] }));

interface ContentFiltersProps {
  query: ContentQuery;
  /** Kendi hesaplar: değer = social_accounts.id. */
  accountOptions: SelectOption[];
}

/**
 * İçerik filtre çubuğu: hesap, format, tarih aralığı, sıralama. Durum URL'dedir;
 * bir değişiklik `router.push` ile sunucuyu yeniden çalıştırır ve sayfalamayı sıfırlar.
 */
export function ContentFilters({ query, accountOptions }: ContentFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (next: ContentQuery) => startTransition(() => router.push(contentHref(next)));
  const choice = (value: string) => (value === ALL ? undefined : value);

  return (
    <div className={cn("mb-4 flex flex-wrap items-end gap-3", pending && "opacity-70")} aria-busy={pending}>
      <LabeledSelect
        label="Hesap"
        value={query.account ?? ALL}
        options={[{ value: ALL, label: "Tüm hesaplar" }, ...accountOptions]}
        onChange={(value) => go(withFilters(query, { account: choice(value) }))}
        className="w-56 max-w-full min-h-tap md:min-h-0"
      />
      <LabeledSelect
        label="Format"
        value={query.format ?? ALL}
        options={FORMAT_OPTIONS}
        onChange={(value) => go(withFilters(query, { format: choice(value) as ContentFormat | undefined }))}
        className="min-h-tap md:min-h-0"
      />
      <LabeledSelect
        label="Tarih aralığı"
        value={query.days ? String(query.days) : ALL}
        options={RANGE_OPTIONS}
        onChange={(value) => {
          const days = choice(value);
          go(withFilters(query, { days: days ? (Number(days) as DateRangeDays) : undefined }));
        }}
        className="min-h-tap md:min-h-0"
      />
      <LabeledSelect
        label="Sıralama"
        value={query.sort}
        options={SORT_OPTIONS}
        onChange={(value) => go(withFilters(query, { sort: value as SortKey }))}
        className="min-h-tap md:min-h-0"
      />
      {hasActiveFilters(query) ? (
        <Link href={contentHref(clearedFilters(query))} className={cn(linkButtonClass("ghost", "default"), "min-h-tap md:min-h-0")}>
          Filtreleri temizle
        </Link>
      ) : null}
    </div>
  );
}
