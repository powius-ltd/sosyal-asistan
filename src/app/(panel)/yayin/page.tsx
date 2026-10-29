import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { loadJobRunContext, loadJobsState } from "@/components/jobs/jobs-state";
import { ComplianceNotice } from "@/components/publish/compliance-notice";
import { CreatePublishDialog } from "@/components/publish/create-job-dialog";
import { buildJobViews } from "@/components/publish/job-views";
import { PublishCalendar } from "@/components/publish/publish-calendar";
import { QuotaCard } from "@/components/publish/quota-card";
import { computePublishQuota } from "@/components/publish/quota";
import { parseAnchor, parseView } from "@/components/publish/view-state";
import { VideoList } from "@/components/publish/video-list";
import { ViewSwitcher } from "@/components/publish/view-switcher";
import { getPanelContext } from "@/lib/data";
import { DEFAULT_COMPLIANCE_REGION } from "@/lib/domain/compliance";
import { MAX_PAGE_LIMIT } from "@/lib/data/queries";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { DEFAULT_TIMEZONE, toDayKey } from "@/lib/format";
import { first } from "@/lib/search-params";
import { isPublishableAccount, workspaceHasZernioKey } from "@/lib/publish/publishable";
import { listWorkspaces } from "@/lib/workspace/registry";
import { supportsPublishing } from "@/lib/platforms/registry";
import { NO_CONNECTED_ACCOUNT_NOTE, unsupportedPublishNote } from "@/lib/plain-language-publish";
import { PUBLISH_FIX_PARAM } from "@/lib/today/publish-fix-href";
import { parseVideoFilter, preparingVideos, videoFilterCounts } from "@/lib/publish/video-status";
import { isBackstageVisible } from "@/lib/workspace/backstage";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export const metadata: Metadata = { title: "Videolar" };

/** İşler bu istekte başlatılamıyorsa (müşteri görünümü, örnek veri, işçi yok) ya da okunamazsa undefined: revize yalnız not kaydeder. */
async function readJobRunContext() {
  try {
    const state = await loadJobsState();
    return state.canRun ? await loadJobRunContext() : undefined;
  } catch (error) {
    console.error("[isler] revize penceresi için iş bağlamı okunamadı", error);
    return undefined;
  }
}

// Next 16: `searchParams` bir Promise'tir. Görünüm durumu URL'dedir (?gorunum=liste|hafta|ay&tarih=YYYY-MM-DD).
export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { repo, wsId, now } = await getPanelContext();

  // Onay bekleyen sayısı ve kota `getPublishSummary`'den (depo sayar); iş listesi yalnız takvim/liste gösterimi içindir.
  const [workspace, jobs, accounts, ideas, summary, orders] = await Promise.all([
    repo.getWorkspace(wsId),
    repo.listPublishJobs(wsId, { limit: MAX_PAGE_LIMIT }),
    repo.listOwnAccounts(wsId),
    repo.listIdeas(wsId, { limit: MAX_PAGE_LIMIT }),
    repo.getPublishSummary(wsId, now),
    repo.listStudioOrders(wsId),
  ]);

  const timeZone = workspace?.timezone ?? DEFAULT_TIMEZONE;
  const today = toDayKey(now, timeZone) ?? now.toISOString().slice(0, 10);
  const view = parseView(query.gorunum);
  const anchor = parseAnchor(query.tarih, today);

  const complianceRegion = workspace?.complianceRegion ?? DEFAULT_COMPLIANCE_REGION;
  const views = buildJobViews(jobs, accounts, ideas, complianceRegion, orders);
  const slug = (await listWorkspaces()).find((w) => w.id === wsId)?.slug;
  const zernioKey = workspaceHasZernioKey(slug);
  const quotaRows = computePublishQuota(accounts, summary, (account) => isPublishableAccount(account, zernioKey));
  const awaitingApproval = summary.pendingApproval;
  const publishAccounts = accounts
    .filter((account) => isPublishableAccount(account, zernioKey) && supportsPublishing(account.platform))
    .map(({ id, handle, platform }) => ({ id, handle, platform }));

  // Yayını olmayan platformdaki hesaplar: başka platformun kuralı uygulanmaz; not hangi hesap olduğunu adıyla söyler (D2-07).
  const unsupported = accounts
    .filter((account) => !supportsPublishing(account.platform))
    .map((account) => ({ handle: account.handle, platformLabel: PLATFORM_LABEL[account.platform] }));
  // "Yeni yayın" yalnız yayın işi açılabilen hesap varken vardır; yoksa düğme de boş durumdaki yönlendirme de yok, not tektir.
  const canCreate = publishAccounts.length > 0;
  const note = unsupportedPublishNote(unsupported, canCreate) ?? (canCreate ? undefined : NO_CONNECTED_ACCOUNT_NOTE);
  const operator = isOperatorMode();
  const backstage = isBackstageVisible();
  const filter = parseVideoFilter(query.durum);
  const ideaTitles = new Map(ideas.map((idea) => [idea.id, idea.title]));
  const preparing = preparingVideos(orders, jobs, (ideaId) => ideaTitles.get(ideaId));
  const counts = videoFilterCounts(jobs, preparing.length);
  const fixJobId = first(query[PUBLISH_FIX_PARAM]);
  // "Revize iste" yeniden üretimi aynı pencereden başlatabilsin diye işler bağlamı: yalnız revize edilebilir video varken ve işler açıkken okunur.
  const jobRun = views.some((v) => v.order?.canRevise) ? await readJobRunContext() : undefined;
  const fixSettings = { accounts: publishAccounts, complianceRegion, operator, now, fixJobId, jobRun };
  return (
    <>
      <PageHeader
        title={backstage ? "Yayın" : "Videolar"}
        description={
          backstage
            ? "Planlanan ve yayınlanan içerikler. Her yayın, yayınlanmadan önce insan onayı gerektirir."
            : "Videolarını izle, beğendiğini onayla; onaylamadığın yayınlanmaz."
        }
        actions={
          backstage && canCreate ? (
            <CreatePublishDialog accounts={publishAccounts} timeZone={timeZone} complianceRegion={complianceRegion} operator={operator} />
          ) : undefined
        }
      />

      {note ? <p className="mb-4 rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">{note}</p> : null}

      {backstage ? (
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
      ) : null}

      <div className="flex flex-col gap-4">
        {backstage ? <ViewSwitcher view={view} anchor={anchor} today={today} /> : null}
        {jobs.length >= MAX_PAGE_LIMIT ? (
          <p className="text-xs text-muted-foreground">En son {MAX_PAGE_LIMIT} iş gösteriliyor; onay bekleyen sayısı ve kota tüm işleri kapsar.</p>
        ) : null}
        {backstage && view !== "liste" ? (
          <PublishCalendar mode={view} anchor={anchor} today={today} views={views} timeZone={timeZone} />
        ) : (
          <VideoList filter={filter} counts={counts} views={views} preparing={preparing} timeZone={timeZone} fixSettings={fixSettings} />
        )}
      </div>
    </>
  );
}
