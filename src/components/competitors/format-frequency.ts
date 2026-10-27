import { formatNumber } from "@/lib/format";

/** 5.7 → "~6 / hafta"; 0.4 → "~2 / ay"; çok seyrekse "<1 / ay". Ölçülemeyen → undefined. */
export function formatFrequency(perWeek: number | undefined): string | undefined {
  if (perWeek === undefined || !Number.isFinite(perWeek)) return undefined;
  if (perWeek >= 1) return `~${formatNumber(Math.round(perWeek))} / hafta`;
  const perMonth = perWeek * (30 / 7);
  return perMonth >= 0.5 ? `~${formatNumber(Math.max(1, Math.round(perMonth)))} / ay` : "<1 / ay";
}
