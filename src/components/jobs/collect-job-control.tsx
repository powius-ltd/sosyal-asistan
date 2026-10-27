"use client";

import { useState } from "react";

import { LabeledSelect, type SelectOption } from "@/components/common/labeled-select";
import { COLLECT_LIMIT_CHOICES } from "@/components/jobs/job-catalog";
import type { JobRunContext } from "@/components/jobs/job-run-types";
import { RunJobButton } from "@/components/jobs/run-job-button";
import { formatNumber } from "@/lib/format";

const DEFAULT_VALUE = "default";
const OPTIONS: readonly SelectOption[] = [
  { value: DEFAULT_VALUE, label: "Varsayılan" },
  ...COLLECT_LIMIT_CHOICES.map((count) => ({ value: String(count), label: `${formatNumber(count)} video` })),
];

/**
 * "Hesaba bak" satırının denetimi: hesap başına video sayısı (tutarı belirler; azaltınca tahmin düşer) + iş düğmesi. Sayı seçilmezse
 * işin kendi varsayılanı kullanılır. Düğme onay penceresini açar; tahmin seçilen sayıyla alınır.
 */
export function CollectJobControl({ context }: { context: JobRunContext }) {
  const [value, setValue] = useState(DEFAULT_VALUE);
  const limit = value === DEFAULT_VALUE ? undefined : Number(value);
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
      <LabeledSelect label="Hesap başına video" value={value} options={OPTIONS} onChange={setValue} className="w-full data-[size=default]:h-11 sm:w-36" />
      <RunJobButton request={{ kind: "collect", ...(limit === undefined ? {} : { limit }) }} context={context} quietWhenBlocked />
    </div>
  );
}
