import type { Metadata } from "next";

import { BriefingCard } from "@/components/briefing/briefing-card";
import { PageHeader } from "@/components/common/page-header";
import { AccountSwitcher } from "@/components/overview/account-switcher";
import { chartScopeLabel, notesScopeLabel, resolveAccountScope } from "@/components/overview/account-scope";
import { BestTimesCard } from "@/components/overview/best-times-card";
import { ExtraKpis } from "@/components/overview/extra-kpis";
import { overviewDescription } from "@/components/overview/header-description";
import { mergeOutliers } from "@/components/overview/merge-outliers";
import { NumbersStrip } from "@/components/overview/numbers-strip";
import { RECENT_OUTLIERS_LIMIT, RecentOutliers } from "@/components/overview/recent-outliers";
import { TrendSection } from "@/components/overview/trend-section";
import { maskotName } from "@/lib/agents/persona";
import { isCopyEdition } from "@/lib/edition";
import { getPanelContext } from "@/lib/data";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { loadOverviewExtras } from "@/lib/overview/load-extras";
import { TODAY_PERIOD_DAYS } from "@/lib/today";
import { isOperatorMode } from "@/lib/workspace/operator-mode";
import { listOperatorWorkspaces } from "@/lib/workspace/registry";

export const metadata: Metadata = { title: "Sonuçlar" };

/**
 * Sonuçlar (eski "Bugün" Ayrıntılar bölümü, artık kendi sayfası): sayılar, notların tamamı, grafikler, son tutan videolar ve en iyi
 * paylaşım saatleri. Hesap seçimi (`?hesap=`) yalnız bu sayfadaki sayıları ve grafikleri daraltır. İçerik eskisiyle aynıdır; ana ekran
 * yalnız cümleli özetini taşır.
 */
export default async function ResultsPage({ searchParams }: PageProps<"/sonuclar">) {
  const { hesap } = await searchParams;
  const { repo, wsId, now } = await getPanelContext();
  const operator = isOperatorMode();

  // Slug yalnız işler kapalıyken yedek kalan yönetici komutları için (`--workspace=<slug>`); liste okunamazsa komut kimlikle kurulur.
  const [accounts, workspace, operatorWorkspaces] = await Promise.all([
    repo.listOwnAccounts(wsId),
    repo.getWorkspace(wsId),
    operator ? listOperatorWorkspaces().catch(() => undefined) : undefined,
  ]);
  const scope = resolveAccountScope(accounts, hesap);
  const [overview, extras] = await Promise.all([
    repo.getOverview(wsId, { days: TODAY_PERIOD_DAYS, accountId: scope.selected?.id }),
    loadOverviewExtras({ repo, wsId, now, accountId: scope.selected?.id, periodDays: TODAY_PERIOD_DAYS }),
  ]);

  const timeZone = workspace?.timezone ?? DEFAULT_TIMEZONE;
  const workspaceRef = { id: wsId, slug: operatorWorkspaces?.find((item) => item.id === wsId)?.slug };
  const outliers = mergeOutliers(overview.recentOutliers, extras.ownOutlierItems ?? [], RECENT_OUTLIERS_LIMIT);
  const scopeLabel = chartScopeLabel(accounts, scope.selected);
  // Hesap yoksa sayılar ve hesap grafikleri çizilmez (hepsi tire olurdu).
  const hasAccountData = accounts.length > 0;

  return (
    <>
      <PageHeader
        title="Sonuçlar"
        description={overviewDescription({ lastCollectedAt: extras.lastCollectedAt, briefing: null, now, timeZone })}
      />
      <div className="flex min-w-0 flex-col gap-4" data-testid="results-page">
        <AccountSwitcher accounts={accounts} selectedId={scope.selected?.id} />
        {hasAccountData ? <NumbersStrip overview={overview} ownOutliers={extras.ownOutliers} /> : null}
        <BriefingCard
          briefing={extras.briefing}
          workspace={workspaceRef}
          // Müşteri kopyasında maskot yok: notların sahibi "Asistan".
          maskotName={isCopyEdition() ? "Asistan" : maskotName()}
          now={now}
          lastCollectedAt={extras.lastCollectedAt}
          timeZone={workspace?.timezone}
          operator={operator}
          scope={hasAccountData ? notesScopeLabel(accounts) : undefined}
        />
        {hasAccountData ? (
          <>
            <ExtraKpis overview={overview} />
            <TrendSection trends={overview.trends} days={overview.days} scopeLabel={scopeLabel} />
          </>
        ) : null}
        <RecentOutliers items={outliers} days={overview.days} timeZone={timeZone} />
        {hasAccountData ? (
          <BestTimesCard bestTimes={overview.bestTimes} timeZone={timeZone} unmeasuredReason={overview.bestTimesUnmeasuredReason} />
        ) : null}
      </div>
    </>
  );
}
