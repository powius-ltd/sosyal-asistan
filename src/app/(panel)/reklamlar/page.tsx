import { WalletCards } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNote } from "@/components/ads/admin-note";
import { AdsTable } from "@/components/ads/ads-table";
import { GoalSection } from "@/components/ads/goal-section";
import { AD_PERIOD_PARAM, parseAdPeriod } from "@/components/ads/period";
import { PeriodPicker } from "@/components/ads/period-picker";
import { SummaryStrip } from "@/components/ads/summary-strip";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import { getPanelContext } from "@/lib/data";
import type { AdAccount } from "@/lib/domain/ads";
import { formatDateTime } from "@/lib/format";
import { AD_EMPTY_PLAIN, AD_PAGE_TITLE_PLAIN } from "@/lib/plain-language-ads";
import { ROUTES } from "@/lib/routes";
import { first } from "@/lib/search-params";
import { isCopyEdition } from "@/lib/edition";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export const metadata: Metadata = { title: AD_PAGE_TITLE_PLAIN };

/** Hesap seçimi adresin `?hesap=` parametresindedir. */
const ACCOUNT_PARAM = "hesap";

/**
 * Reklamlar: harcama, sonuç, bir sonucun maliyeti ve her reklam için nedenli öneri. Para ve öneri yalnız yönetici modunda (müşteri / SaaS
 * ayrımı 22 Eki mülakatına bağlı; o zaman yalnız bu kapı değişir): müşteri görünümünde sayfa yok (404). Panel reklam hesabına YAZMAZ.
 */
export default async function AdsPage({ searchParams }: PageProps<"/reklamlar">) {
  if (isCopyEdition() || !isOperatorMode()) notFound(); // müşteri kopyasında reklam modülü yok
  const params = await searchParams;
  const days = parseAdPeriod(first(params[AD_PERIOD_PARAM]));
  const accountId = first(params[ACCOUNT_PARAM]);
  const { repo, wsId, now } = await getPanelContext();
  const [accounts, jobs] = await Promise.all([repo.listAdAccounts(wsId), repo.listJobs(wsId, { status: "succeeded", limit: 50 })]);
  const lastSync = formatDateTime(jobs.find((job) => job.kind === "ads_sync")?.finishedAt);
  const report = accounts.length === 0 ? undefined : await repo.getAdReport(wsId, { ...(accountId === undefined ? {} : { accountId }), days }, now);

  return (
    <>
      <PageHeader title={AD_PAGE_TITLE_PLAIN} description={AD_SCREEN_COPY.description} actions={report ? <PeriodPicker days={days} /> : undefined} />
      {report === undefined ? (
        <div className="space-y-6">
          <EmptyState icon={WalletCards} title={AD_EMPTY_PLAIN.title} description={AD_EMPTY_PLAIN.body} />
          <AdminNote lastSync={lastSync} showLink />
        </div>
      ) : (
        <>
          {accounts.length > 1 ? <AccountLinks accounts={accounts} currentId={report.account.id} days={days} /> : null}
          <SummaryStrip report={report} />
          <GoalSection account={report.account} />
          <AdsTable report={report} />
          <AdminNote lastSync={lastSync} showLink={false} />
        </>
      )}
    </>
  );
}

function AccountLinks({ accounts, currentId, days }: { accounts: AdAccount[]; currentId: string; days: number }) {
  return (
    <nav aria-label={AD_SCREEN_COPY.accountLabel} className="mb-4 flex flex-wrap gap-2">
      {accounts.map((account) => {
        const query = new URLSearchParams({ [ACCOUNT_PARAM]: account.id });
        if (days !== 28) query.set(AD_PERIOD_PARAM, String(days));
        return (
          <Link
            key={account.id}
            href={`${ROUTES.ads}?${query.toString()}`}
            aria-current={account.id === currentId ? "page" : undefined}
            className="inline-flex min-h-tap items-center rounded-lg border px-3 text-sm aria-[current=page]:bg-muted aria-[current=page]:font-medium md:min-h-9"
          >
            {account.label ?? account.externalAccountId} · {account.currency}
          </Link>
        );
      })}
    </nav>
  );
}
