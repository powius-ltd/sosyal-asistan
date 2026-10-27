import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ComplianceNotice } from "@/components/publish/compliance-notice";
import { CreatePublishDialog } from "@/components/publish/create-job-dialog";
import { buildJobViews } from "@/components/publish/job-views";
import { PublishCalendar } from "@/components/publish/publish-calendar";
import { PublishList } from "@/components/publish/publish-list";
import { QuotaCard } from "@/components/publish/quota-card";
import { computePublishQuota } from "@/components/publish/quota";
import { parseAnchor, parseView } from "@/components/publish/view-state";
import { ViewSwitcher } from "@/components/publish/view-switcher";
import { getPanelContext } from "@/lib/data";
import { DEFAULT_COMPLIANCE_REGION } from "@/lib/domain/compliance";
import { MAX_PAGE_LIMIT } from "@/lib/data/queries";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { DEFAULT_TIMEZONE, toDayKey } from "@/lib/format";
import { first } from "@/lib/search-params";
import { supportsPublishing } from "@/lib/platforms/registry";
import { NO_CONNECTED_ACCOUNT_NOTE, unsupportedPublishNote } from "@/lib/plain-language-publish";
import { PUBLISH_FIX_PARAM } from "@/lib/today/publish-fix-href";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export const metadata: Metadata = { title: "Yayın" };

// Next 16: `searchParams` bir Promise'tir. Görünüm durumu URL'dedir (?gorunum=liste|hafta|ay&tarih=YYYY-MM-DD).
export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { repo, wsId, now } = await getPanelContext();

  // Onay bekleyen sayısı ve kota `getPublishSummary`'den (depo sayar); iş listesi yalnız takvim/liste gösterimi içindir.
  const [workspace, jobs, accounts, ideas, summary] = await Promise.all([
    repo.getWorkspace(wsId),
    repo.listPublishJobs(wsId, { limit: MAX_PAGE_LIMIT }),
    repo.listOwnAccounts(wsId),
    repo.listIdeas(wsId, { limit: MAX_PAGE_LIMIT }),
    repo.getPublishSummary(wsId, now),
  ]);

  const timeZone = workspace?.timezone ?? DEFAULT_TIMEZONE;
  const today = toDayKey(now, timeZone) ?? now.toISOString().slice(0, 10);
  const view = parseView(query.gorunum);
  const anchor = parseAnchor(query.tarih, today);

  const complianceRegion = workspace?.complianceRegion ?? DEFAULT_COMPLIANCE_REGION;
  const views = buildJobViews(jobs, accounts, ideas, complianceRegion);
  const quotaRows = computePublishQuota(accounts, summary);
  const awaitingApproval = summary.pendingApproval;
  const publishAccounts = accounts
    .filter((account) => account.connection === "connected" && supportsPublishing(account.platform))
    .map(({ id, handle, platform }) => ({ id, handle, platform }));

  // Yayını olmayan platformdaki hesaplar: başka platformun kuralı uygulanmaz; not hangi hesap olduğunu adıyla söyler (D2-07).
  const unsupported = accounts
    .filter((account) => !supportsPublishing(account.platform))
    .map((account) => ({ handle: account.handle, platformLabel: PLATFORM_LABEL[account.platform] }));
  // "Yeni yayın" yalnız yayın işi açılabilen hesap varken vardır; yoksa düğme de boş durumdaki yönlendirme de yok, not tektir.
  const canCreate = publishAccounts.length > 0;
  const note = unsupportedPublishNote(unsupported, canCreate) ?? (canCreate ? undefined : NO_CONNECTED_ACCOUNT_NOTE);
  const operator = isOperatorMode();
  const fixJobId = first(query[PUBLISH_FIX_PARAM]);
  const fixSettings = { accounts: publishAccounts, complianceRegion, operator, now, fixJobId };
  return (
    <>
      <PageHeader
        title="Yayın"
        description="Planlanan ve yayınlanan içerikler. Her yayın, yayınlanmadan önce insan onayı gerektirir."
        actions={
          canCreate ? (
            <CreatePublishDialog accounts={publishAccounts} timeZone={timeZone} complianceRegion={complianceRegion} operator={operator} />
          ) : undefined
        }
      />

      {note ? <p className="mb-4 rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">{note}</p> : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr_2fr]">
        <StatCard
          label="Onay bekleyen"
          value={awaitingApproval}
          unit="iş"
          tone={awaitingApproval > 0 ? "warning" : "default"}
          icon={<CircleCheck />}
          hint="Onaylamadan yayınlanmaz."
        />
        <QuotaCard rows={quotaRows} />
        <ComplianceNotice />
      </div>

      <div className="flex flex-col gap-4">
        <ViewSwitcher view={view} anchor={anchor} today={today} />
        {jobs.length >= MAX_PAGE_LIMIT ? (
          <p className="text-xs text-muted-foreground">En son {MAX_PAGE_LIMIT} iş gösteriliyor; onay bekleyen sayısı ve kota tüm işleri kapsar.</p>
        ) : null}
        {view === "liste" ? (
          <PublishList views={views} timeZone={timeZone} canCreate={canCreate} fixSettings={fixSettings} />
        ) : (
          <PublishCalendar mode={view} anchor={anchor} today={today} views={views} timeZone={timeZone} />
        )}
      </div>
    </>
  );
}
