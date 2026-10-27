import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdDetailView } from "@/components/ads/ad-detail";
import { AD_PERIOD_PARAM, parseAdPeriod } from "@/components/ads/period";
import { PeriodPicker } from "@/components/ads/period-picker";
import { PageHeader } from "@/components/common/page-header";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import { getPanelContext } from "@/lib/data";
import { RepositoryError } from "@/lib/data/repository";
import { AD_PAGE_TITLE_PLAIN } from "@/lib/plain-language-ads";
import { ROUTES } from "@/lib/routes";
import { first } from "@/lib/search-params";
import { isCopyEdition } from "@/lib/edition";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export const metadata: Metadata = { title: AD_PAGE_TITLE_PLAIN };

/** Tek reklamın ayrıntısı. Yalnız yönetici modunda (müşteri görünümünde 404); bilinmeyen ya da başka çalışma alanının reklamı 404. */
export default async function AdDetailPage({ params, searchParams }: PageProps<"/reklamlar/[id]">) {
  if (isCopyEdition() || !isOperatorMode()) notFound(); // müşteri kopyasında reklam modülü yok
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const days = parseAdPeriod(first(query[AD_PERIOD_PARAM]));
  const { repo, wsId, now } = await getPanelContext();
  const detail = await repo.getAdDetail(wsId, id, { days }, now).catch((error: unknown) => {
    if (error instanceof RepositoryError && error.code === "not_found") return undefined;
    throw error;
  });
  if (detail === undefined) notFound();
  return (
    <>
      <PageHeader title={detail.result.ad.name} back={{ href: ROUTES.ads, label: AD_SCREEN_COPY.detail.back }} actions={<PeriodPicker days={days} />} />
      <AdDetailView detail={detail} />
    </>
  );
}
