import type { Metadata } from "next";

import { AutomationList } from "@/components/automation/automation-list";
import { PageHeader } from "@/components/common/page-header";
import { AUTOMATION_COPY as COPY } from "@/lib/copy/automation";
import { AUTOMATION_PRODUCE_READY } from "@/lib/automation/flags";
import { buildAutomationRows } from "@/lib/automation/model";
import { getPanelContext } from "@/lib/data";

export const metadata: Metadata = { title: "Otomatik" };

/** Otomatik işler: panelin kendiliğinden yaptığı 4 iş, açık/kapalı durumu, son çalışması ve sıradaki zamanı. Veri yalnız depodan. */
export default async function AutomationPage() {
  const { repo, wsId, now } = await getPanelContext();
  const [workspace, jobs] = await Promise.all([repo.getWorkspace(wsId), repo.listJobs(wsId, { limit: 200 })]);
  const rows = workspace === null || workspace === undefined ? [] : buildAutomationRows({ workspace, jobs, now, produceReady: AUTOMATION_PRODUCE_READY });
  // Barındırılan ortamda (VERCEL) ayar kapalıdır (action da reddeder); müşteri kopyasında açıktır.
  const canEdit = !process.env.VERCEL?.trim();
  return (
    <>
      <PageHeader title={COPY.title} description={canEdit ? COPY.description : `${COPY.description} ${COPY.closed}`} />
      <AutomationList rows={rows} canEdit={canEdit} />
    </>
  );
}
