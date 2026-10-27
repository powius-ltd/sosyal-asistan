export const AD_PERIOD_OPTIONS = [7, 14, 28] as const;
export type AdPeriodOption = (typeof AD_PERIOD_OPTIONS)[number];
export const AD_PERIOD_PARAM = "gun";

/** Adres parametresinden dönem: yalnız 7 / 14 / 28 geçerli, başka her değer 28. */
export function parseAdPeriod(raw: string | undefined): AdPeriodOption {
  const days = Number(raw);
  return (AD_PERIOD_OPTIONS as readonly number[]).includes(days) ? (days as AdPeriodOption) : 28;
}
