/**
 * "Bugün"ün istek başına TEK okuması: sayfa (`app/(panel)/page.tsx`) ve panel düzenindeki sohbet düğmesinin karar noktası
 * (`chat/ask-signal.ts`) aynı sonucu paylaşır; React `cache()` sayesinde aynı istekte ikinci okuma yapılmaz. Saat `getPanelContext`'in
 * tek saatidir (`now`).
 */
import "server-only";

import { cache } from "react";

import { loadOnboardingState } from "@/components/onboarding/onboarding-data";
import { loadTodayJobs } from "@/components/today/today-jobs";
import { getPanelContext } from "@/lib/data";
import { onboardingGate } from "@/lib/onboarding/gate";
import { readSafe } from "@/lib/overview/read-safe";
import { buildToday, loadTodayInput } from "@/lib/today";
import type { Today, TodayInput, TodayJobsState } from "@/lib/today";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export interface TodayData {
  now: Date;
  operator: boolean;
  input: TodayInput;
  /** Çalışma alanının iş durumu (yalnız yönetici modunda okunur). */
  jobs: TodayJobsState | undefined;
  today: Today;
}

export const loadTodayData = cache(async (): Promise<TodayData> => {
  const { repo, wsId, now } = await getPanelContext();
  const operator = isOperatorMode();
  const [loaded, jobs, flow] = await Promise.all([loadTodayInput(repo, wsId, now, { operator }), loadTodayJobs(operator), readSafe("başlangıç akışı", loadOnboardingState)]);
  // Başlangıç kartı: süren akışı herkes görür; kullanıcıyı bekleyen akış yalnız eylemlerin açık olduğu ortamda (kart kapalı ekrana götürmesin).
  const flowRunning = flow?.step === "probing" || flow?.step === "building";
  const onboarding = flow !== undefined && (flowRunning || onboardingGate().open) ? { step: flow.step, ...(flow.next === undefined ? {} : { next: flow.next }), ...(flow.reason === undefined ? {} : { reason: flow.reason }) } : undefined;
  const input: TodayInput = { ...loaded, ...(onboarding === undefined ? {} : { onboarding }) };
  return { now, operator, input, jobs, today: buildToday({ ...input, jobs }) };
});
