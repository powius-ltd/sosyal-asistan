import type { AdGoalInput } from "@/lib/data/ad-schema";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import type { AdGoal, AdGoalKind } from "@/lib/domain/ads";
import { formatDecimal, formatMoney, formatPercent } from "@/lib/format";

const COPY = AD_SCREEN_COPY.goal;

export interface GoalFields {
  kind: AdGoalKind;
  resultLabel: string;
  targetReturn: string;
  grossMargin: string;
  targetCost: string;
}

/** "2,5" ve "2.5" ikisi de geçerli; boş ya da sayı olmayan → undefined. */
export function parseLocaleNumber(raw: string): number | undefined {
  const text = raw.trim().replace(",", ".");
  if (text === "") return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export type GoalBuild = { ok: true; goal: AdGoalInput } | { ok: false; message: string };

/**
 * Form alanlarından hedef girdisi. Burada yalnız sayı biçimi denetlenir (Türkçe hata); asıl doğrulama sunucudadır (action + zod),
 * istemciye güvenilmez.
 */
export function buildGoalInput(fields: GoalFields): GoalBuild {
  const resultLabel = fields.resultLabel.trim();
  if (fields.kind === "cost") {
    const targetCostPerResult = parseLocaleNumber(fields.targetCost);
    return targetCostPerResult === undefined ? { ok: false, message: COPY.numberInvalid } : { ok: true, goal: { kind: "cost", resultLabel, targetCostPerResult } };
  }
  const targetReturn = parseLocaleNumber(fields.targetReturn);
  if (targetReturn === undefined) return { ok: false, message: COPY.numberInvalid };
  if (fields.grossMargin.trim() === "") return { ok: true, goal: { kind: "value", resultLabel, targetReturn } };
  const percent = parseLocaleNumber(fields.grossMargin);
  if (percent === undefined || percent < 1 || percent > 100) return { ok: false, message: COPY.marginInvalid };
  return { ok: true, goal: { kind: "value", resultLabel, targetReturn, grossMargin: percent / 100 } };
}

/** Hedefin tek cümlesi ("satın alma için harcadığın her 1 birime 3,0 birim dönmeli"); hedef yoksa undefined. */
export function goalSentence(goal: AdGoal | undefined, currency: string): string | undefined {
  if (goal === undefined) return undefined;
  if (goal.kind === "cost") {
    const cost = formatMoney(goal.targetCostPerResult, currency);
    return cost === undefined ? undefined : `${goal.resultLabel} başına en çok ${cost}`;
  }
  const target = formatDecimal(goal.targetReturn, 1);
  if (target === undefined) return undefined;
  const margin = formatPercent(goal.grossMargin, 0);
  return `${goal.resultLabel} için harcadığın her 1 ${currency}'ye ${target} ${currency} dönmeli${margin === undefined ? "" : ` (brüt kâr payı ${margin})`}`;
}
