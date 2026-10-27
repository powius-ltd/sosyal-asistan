import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadCollectionMembership } from "@/components/collections/load-membership";
import { SaveToCollectionButton } from "@/components/collections/save-to-collection-button";
import { PageHeader } from "@/components/common/page-header";
import { CopyPromptButton } from "@/components/prompt/copy-prompt-button";
import { VideoBackLink } from "@/components/video/back-link";
import { AnalysisPanel } from "@/components/video/analysis-panel";
import { ContentEmbed } from "@/components/video/content-embed";
import { ConvertToIdeaButton } from "@/components/video/convert-to-idea-button";
import { EditMetricsCard } from "@/components/video/edit-metrics-card";
import { EvidenceReportCard } from "@/components/video/evidence-report-card";
import { MetricCards } from "@/components/video/metric-cards";
import { SnapshotChartCard } from "@/components/video/snapshot-chart-card";
import { TranscriptPanel } from "@/components/video/transcript-panel";
import { VideoSummary } from "@/components/video/video-summary";
import { WhyItWorks } from "@/components/video/why-it-works";
import { getPanelContext } from "@/lib/data";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { getPlatformModule, hasPlatformModule } from "@/lib/platforms/registry";
import { ROUTES } from "@/lib/routes";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export const metadata: Metadata = { title: "Video analizi" };

// Next 16: `params` bir Promise'tir.
export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo, wsId } = await getPanelContext();
  const [detail, workspace, membership] = await Promise.all([
    repo.getContent(wsId, id),
    repo.getWorkspace(wsId),
    // "Kaydet" düğmesinin ilk durumu (toplu okumanın tek kimlikli hâli; sayfa kendisi okur, düğme okumaz).
    loadCollectionMembership(repo, wsId, [id]),
  ]);
  if (!detail) notFound();
  // Tarihler workspace saat diliminde (diğer ekranlar gibi).
  const timeZone = workspace?.timezone ?? DEFAULT_TIMEZONE;

  const { item, snapshots, baseline, transcript, analysis } = detail;
  const isOwn = item.owner.kind === "own";
  // Resmi gömme adresi platform modülünden (platform adıyla dallanılmaz); modül yoksa oynatıcı sunulmaz.
  const platformLabel = PLATFORM_LABEL[item.platform];
  const embedUrl = hasPlatformModule(item.platform) ? getPlatformModule(item.platform).embedUrl(item.url) : undefined;

  const back = isOwn ? { href: ROUTES.content, label: "İçeriklerim" } : { href: ROUTES.outliers, label: "Tutan içerikler" };

  return (
    <>
      <VideoBackLink {...back} />
      <PageHeader
        title="Video analizi"
        description={`@${item.owner.handle} içeriği: neden tuttuğu, ne söylediği ve nasıl kurgulandığı.`}
        actions={
          <>
            <SaveToCollectionButton contentId={item.id} initialCollectionIds={membership[item.id]} />
            <CopyPromptButton source={{ kind: "content", contentId: item.id }} />
            <ConvertToIdeaButton />
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="flex flex-col gap-4">
            <VideoSummary item={item} timeZone={timeZone} />
            <MetricCards item={item} timeZone={timeZone} />
          </div>
          <ContentEmbed embedUrl={embedUrl} platformLabel={platformLabel} title={`@${item.owner.handle} içeriği (${platformLabel})`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="flex lg:col-span-3 [&>*]:flex-1">
            <SnapshotChartCard snapshots={snapshots} timeZone={timeZone} />
          </div>
          <div className="flex lg:col-span-2 [&>*]:flex-1">
            <WhyItWorks
              score={item.score}
              baseline={baseline}
              timeZone={timeZone}
              views={item.metrics.views}
              followers={item.owner.followers}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <TranscriptPanel
            item={item}
            transcript={transcript}
            hookText={analysis?.hookText}
            hookSource={analysis?.hookSource}
            editMetrics={analysis?.editMetrics}
            timeZone={timeZone}
          />
          <AnalysisPanel analysis={analysis} operator={isOperatorMode()} />
        </div>

        {/* Kurgu ölçümleri ve kanıt raporu: başarısız analizde ölçülecek/denetlenecek bir şey yok. */}
        {analysis && analysis.status !== "failed" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <EditMetricsCard analysis={analysis} />
            <EvidenceReportCard analysis={analysis} />
          </div>
        ) : null}
      </div>
    </>
  );
}
