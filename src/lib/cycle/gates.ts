/**
 * Zincirin ek kapıları (SAF): (1) kredi zorlaması açıkken kredi harcayan tür zincirce AÇILMAZ (kredi ayırma onay ister; zincir onaysızdır);
 * (2) çekim fişi (slip) yalnız stüdyo bağlı çalışma alanında üretilir.
 */
import type { ChainDecision } from "@/lib/cycle/next";
import type { CycleStepId } from "@/lib/cycle/types";
import { jobCreditCeiling } from "@/lib/domain/job-credits";
import type { JobKind } from "@/lib/domain/panel-job";
import { DAY_MS } from "@/lib/time";

export function gateByCredits(decision: ChainDecision, creditsEnforced: boolean, stepOf: (kind: JobKind) => CycleStepId | undefined = () => undefined): ChainDecision {
  if (!creditsEnforced || !("request" in decision)) return decision;
  const { kind } = decision.request;
  if (jobCreditCeiling(kind) <= 0) return decision;
  const step = stepOf(kind);
  return { stop: { reason: "needs_approval", notify: step !== undefined, ...(step === undefined ? {} : { step }) } };
}

/** Fiş üretimi yalnız stüdyo hesabı olarak tanımlı çalışma alanı için (slug `listStudioPanelSlugs` içinde). */
export const slipAllowedFor = (slug: string | null | undefined, studioSlugs: readonly string[]): boolean => slug !== null && slug !== undefined && studioSlugs.includes(slug);

const ISTANBUL_OFFSET_MS = 3 * 3_600_000;

/** İstanbul gününün (UTC+3, yaz saati yok) başlangıcı, ISO UTC olarak: günlük zincir sınırı takvim gününe göre sayılır. */
export function istanbulDayStart(now: Date): string {
  return new Date(Math.floor((now.getTime() + ISTANBUL_OFFSET_MS) / DAY_MS) * DAY_MS - ISTANBUL_OFFSET_MS).toISOString();
}
