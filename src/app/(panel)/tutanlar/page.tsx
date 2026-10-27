import type { Metadata } from "next";

import { loadCollectionMembership } from "@/components/collections/load-membership";
import { PageHeader } from "@/components/common/page-header";
import { platformFilterOptions } from "@/components/common/platform-filter-options";
import { LiftExplainer } from "@/components/outliers/lift-explainer";
import { OutlierFilters } from "@/components/outliers/outlier-filters";
import { OutlierResults } from "@/components/outliers/outlier-results";
import { OutlierViewToggle } from "@/components/outliers/outlier-view-toggle";
import { DEFAULT_MIN_TIER, parseOutlierParams, toOutlierFilter } from "@/components/outliers/search-params";
import { loadAdUsage } from "@/components/outliers/load-ad-usage";
import { getPanelContext } from "@/lib/data";
import { organicAdMarks } from "@/lib/matrix/ad-organic";
import { OUTLIERS_PLAIN } from "@/lib/plain-language-results";

export const metadata: Metadata = { title: OUTLIERS_PLAIN.title };

export default async function OutliersPage(props: PageProps<"/tutanlar">) {
  const state = parseOutlierParams(await props.searchParams);
  const { repo, wsId, now } = await getPanelContext();
  const [workspace, page] = await Promise.all([
    repo.getWorkspace(wsId),
    repo.listOutliers(wsId, toOutlierFilter(state, now)),
  ]);
  // "Kaydet" düğmelerinin ilk durumu: sayfadaki tüm içerikler için TEK toplu okuma.
  const membership = await loadCollectionMembership(repo, wsId, page.items.map((item) => item.id));
  // Reklam işareti: yalnız yönetici modunda ve reklam hesabı varken (yoksa `undefined`: ekran öncekiyle aynı).
  const ownIds = page.items.filter((item) => item.owner.kind === "own").map((item) => item.id);
  const usage = await loadAdUsage(repo, wsId, ownIds, now);
  const adMarks = usage === undefined ? undefined : organicAdMarks(page.items, usage, now);

  return (
    <>
      <PageHeader
        title={state.minTier >= DEFAULT_MIN_TIER ? OUTLIERS_PLAIN.title : OUTLIERS_PLAIN.titleLowered}
        description={OUTLIERS_PLAIN.description(state.minTier)}
        actions={<OutlierViewToggle view={state.view} />}
      />
      <LiftExplainer />
      <OutlierFilters state={state} platformOptions={platformFilterOptions("Tüm platformlar", "all")} />
      <OutlierResults state={state} page={page} timeZone={workspace?.timezone} membership={membership} adMarks={adMarks} />
    </>
  );
}
