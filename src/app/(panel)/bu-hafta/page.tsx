import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { loadActiveOrderIds } from "@/components/studio-order/order-map";
import { ReportPdfLink } from "@/components/report/report-pdf-link";
import { MeasurementDueStrip } from "@/components/weekly-plan/measurement-due-strip";
import { readOptional } from "@/components/weekly-plan/optional-read";
import { PlanEmptyState } from "@/components/weekly-plan/plan-empty-state";
import { PLAN_WEEK_PARAM } from "@/components/weekly-plan/week-param";
import { WeekPicker } from "@/components/weekly-plan/week-picker";
import { WeeklyPlanView } from "@/components/weekly-plan/weekly-plan-view";
import { getPanelContext } from "@/lib/data";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import { previousWeeks } from "@/lib/insights/feedback";
import { first } from "@/lib/search-params";
import { truncateText } from "@/lib/text";

export const metadata: Metadata = { title: "Bu hafta" };

/** Hafta seçicide gösterilen son plan sayısı. */
const PICKER_LIMIT = 8;

/**
 * Bu hafta — haftalık içerik planı. Varsayılan en son plan; `?hafta=YYYY-MM-DD` (Pazartesi) belirli haftayı açar.
 * Veri yalnız depodan okunur; plan `npm run plan:week` ile sunucuda üretilir. "Geçen hafta" = bir önceki haftanın planının sonucu
 * (`getWeekReview`, okuma anında hesaplanır); "ölçüm zamanı geldi" şeridi `listMeasurementDue`'dan (ücretsiz). İkisi de salt okuma:
 * render sırasında yazma yok. Depo bunları henüz desteklemiyorsa (`not_implemented`) sayfa boş durumla çalışır.
 */
export default async function ThisWeekPage({ searchParams }: PageProps<"/bu-hafta">) {
  const requestedRaw = first((await searchParams)[PLAN_WEEK_PARAM]);
  // Biçimsiz/var olmayan gün (`invalid_input` fırlatır) depoya gitmez: en son plana düşülür ve not edilir.
  const requestedWeek = requestedRaw === undefined ? undefined : weekStartOf(requestedRaw);
  const invalidRequest = requestedRaw !== undefined && requestedWeek === undefined;

  const { repo, wsId, now } = await getPanelContext();
  const [summaries, requestedPlan] = await Promise.all([
    repo.listWeeklyPlans(wsId, { limit: PICKER_LIMIT }),
    requestedWeek ? repo.getWeeklyPlan(wsId, requestedWeek) : Promise.resolve(null),
  ]);
  const latestWeek = summaries[0]?.weekStart;
  const plan = requestedWeek ? requestedPlan : latestWeek ? await repo.getWeeklyPlan(wsId, latestWeek) : null;
  const reviewedWeek = plan ? previousWeeks(plan.weekStart, 1)[0] : undefined;
  const [review, due, orderIdByIdea] = await Promise.all([
    reviewedWeek ? readOptional(() => repo.getWeekReview(wsId, reviewedWeek, now)) : undefined,
    readOptional(() => repo.listMeasurementDue(wsId, now)),
    // Plan öğelerinin fişi: tek okuma (kart başına değil).
    plan ? loadActiveOrderIds(repo, wsId, plan.items.map((item) => item.ideaId)) : undefined,
  ]);

  return (
    <>
      <PageHeader
        title="Bu hafta"
        description="Haftalık içerik planı: rakiplerde ne tuttu, bu hafta neye yüklenmeli, hangi 3–5 içeriği çekmeli ve ne zaman paylaşmalı."
        actions={plan ? <ReportPdfLink weekStart={plan.weekStart} /> : undefined}
      />
      <MeasurementDueStrip due={due.value ?? []} />
      <WeekPicker plans={summaries} selected={plan?.weekStart ?? requestedWeek} />
      {invalidRequest ? (
        <p className="mb-6 rounded-lg border border-notice-border bg-notice px-4 py-2 text-sm text-notice-foreground">
          “{truncateText(requestedRaw ?? "", 40)}” geçerli bir hafta değil (YYYY-MM-DD bekleniyor); en son plan gösteriliyor.
        </p>
      ) : null}
      {plan ? (
        <WeeklyPlanView plan={plan} review={review} orderIdByIdea={orderIdByIdea} />
      ) : (
        <PlanEmptyState requestedWeek={requestedWeek} hasOtherPlans={summaries.length > 0} />
      )}
    </>
  );
}
