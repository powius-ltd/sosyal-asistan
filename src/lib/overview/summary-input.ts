import type { OwnAccount } from "@/lib/domain/competitor";
import type { Overview } from "@/lib/domain/overview";
import type { Workspace } from "@/lib/domain/run";
import type { OverviewExtras } from "@/lib/overview/load-extras";
import type { OverviewSummaryInput } from "@/lib/overview/types";

interface SummaryInputArgs {
  operator: boolean;
  accounts: readonly OwnAccount[];
  overview: Overview;
  workspace: Workspace | null;
  extras: OverviewExtras;
  /** İçinde bulunulan haftanın Pazartesi'si (istek saatinden). */
  currentWeekStart?: string;
}

/** Sayfanın okuduğu parçaları `buildOverviewSummary` girdisine çevirir (okunamayan parça `undefined` geçer). */
export function toSummaryInput({ operator, accounts, overview, workspace, extras, currentWeekStart }: SummaryInputArgs): OverviewSummaryInput {
  return {
    operator,
    accounts,
    overview,
    ownOutliers: extras.ownOutliers,
    lastCollectedAt: extras.lastCollectedAt,
    activity: extras.activity,
    newIdeas: extras.newIdeas,
    plan: extras.plan,
    review: extras.review,
    currentWeekStart,
    pendingApproval: extras.pendingApproval,
    suggestedLinks: extras.suggestedLinks,
    measurementDueDays: extras.measurementDue?.map((due) => due.day),
    measureCapApproved: workspace === null ? undefined : workspace.measureMonthlyCapUsd !== undefined,
  };
}
