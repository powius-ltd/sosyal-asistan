"use client";

import { AD_PERIOD_OPTIONS, AD_PERIOD_PARAM, type AdPeriodOption } from "@/components/ads/period";
import { useUrlParams } from "@/components/common/use-url-params";
import { Button } from "@/components/ui/button";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";

/** Dönem seçici (7 / 14 / 28 gün): seçim adresin `?gun=` parametresindedir. */
export function PeriodPicker({ days }: { days: AdPeriodOption }) {
  const { update, pending } = useUrlParams();
  return (
    <div role="group" aria-label={AD_SCREEN_COPY.periodLabel} className="flex flex-wrap gap-2">
      {AD_PERIOD_OPTIONS.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={option === days ? "default" : "outline"}
          aria-pressed={option === days}
          disabled={pending}
          className="max-md:min-h-tap"
          onClick={() => update({ [AD_PERIOD_PARAM]: option === 28 ? undefined : String(option) })}
        >
          {AD_SCREEN_COPY.periodOption(option)}
        </Button>
      ))}
    </div>
  );
}
