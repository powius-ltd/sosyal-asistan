import type { Metadata } from "next";

import { ReportEmpty } from "@/components/report/report-empty";
import { ReportToolbar } from "@/components/report/report-toolbar";
import { WeeklyReportDocument } from "@/components/report/weekly-report-document";
import { readOptional } from "@/components/weekly-plan/optional-read";
import { PLAN_WEEK_PARAM } from "@/components/weekly-plan/week-param";
import { REPORT_COPY } from "@/lib/copy/report";
import { getPanelContext } from "@/lib/data";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import { previousWeeks } from "@/lib/insights/feedback";
import { buildWeeklyReport } from "@/lib/report/build-report";
import { first } from "@/lib/search-params";

export const metadata: Metadata = { title: REPORT_COPY.documentTitle };

/**
 * Haftalık yol haritası (yazdırılabilir, PDF'e kaydedilir). Varsayılan en son plan; `?hafta=YYYY-AA-GG` belirli haftayı açar
 * (biçimsiz gün en son plana düşer; o haftanın planı yoksa "plan yok" sayfası). Veri yalnız depodan okunur (salt okuma); "geçen hafta"
 * ve "güncel notlar" bu veri kaynağında desteklenmiyorsa ya da yoksa bölümleri çizilmez.
 */
export default async function WeeklyReportPage({ searchParams }: PageProps<"/rapor/haftalik">) {
  const requestedRaw = first((await searchParams)[PLAN_WEEK_PARAM]);
  const requestedWeek = requestedRaw === undefined ? undefined : weekStartOf(requestedRaw);

  const { repo, wsId, now } = await getPanelContext();
  const [workspace, accounts, summaries] = await Promise.all([
    repo.getWorkspace(wsId),
    repo.listOwnAccounts(wsId),
    requestedWeek ? Promise.resolve([]) : repo.listWeeklyPlans(wsId, { limit: 1 }),
  ]);
  const week = requestedWeek ?? summaries[0]?.weekStart;
  const plan = week ? await repo.getWeeklyPlan(wsId, week) : null;
  if (!plan) {
    return (
      <>
        <ReportToolbar weekStart={requestedWeek} printable={false} />
        <ReportEmpty />
      </>
    );
  }

  const reviewedWeek = previousWeeks(plan.weekStart, 1)[0];
  const [review, briefing] = await Promise.all([
    reviewedWeek ? readOptional(() => repo.getWeekReview(wsId, reviewedWeek, now)) : undefined,
    readOptional(() => repo.getLatestBriefing(wsId)),
  ]);
  const account = accounts.find((a) => a.id === plan.accountId) ?? accounts.find((a) => a.platform === plan.platform) ?? accounts[0];
  const report = buildWeeklyReport({
    plan,
    workspaceName: workspace?.name ?? "",
    handle: account?.handle,
    review: review?.value,
    briefing: briefing.value,
    now,
  });

  return (
    <>
      <ReportToolbar weekStart={plan.weekStart} />
      <WeeklyReportDocument report={report} />
    </>
  );
}
