import { BookOpen, GitCompareArrows, ScanSearch } from "lucide-react";
import Link from "next/link";

import { DimensionTables } from "@/components/anatomy/dimension-tables";
import { RecipeCard } from "@/components/anatomy/recipe-card";
import { SelectedVideo, type AnatomySelection } from "@/components/anatomy/selected-video";
import { VideoPicker } from "@/components/anatomy/video-picker";
import { EmptyState } from "@/components/common/empty-state";
import { ScrollToTarget } from "@/components/common/scroll-to-target";
import { buttonVariants } from "@/components/ui/button";
import type { AnatomyReport } from "@/lib/domain/anatomy";
import type { Insights } from "@/lib/domain/insights";
import { ANATOMY_PLAIN } from "@/lib/anatomy/plain";
import { formatNumber } from "@/lib/format";
import { plainOrFallback, timesText } from "@/lib/plain-language-results";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Başlık sağındaki bağlantılar: Karşılaştırma ve Açılış kütüphanesi. */
export function AnatomyLinks() {
  return (
    <>
      <Link href={ROUTES.comparison} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "max-md:min-h-tap")}>
        <GitCompareArrows aria-hidden />
        {ANATOMY_PLAIN.compare}
      </Link>
      <Link href={ROUTES.hooks} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "max-md:min-h-tap")}>
        <BookOpen aria-hidden />
        {ANATOMY_PLAIN.openingLibrary}
      </Link>
    </>
  );
}

/** Seçili video panelinin kimliği: adresten `?video=` ile açılınca kaydırma ve odak buraya gelir. */
const SELECTED_VIDEO_ID = "anatomy-selected-video";

interface AnatomyViewProps {
  report: AnatomyReport;
  insights: Insights;
  /** Seçili videonun durumu (rapordaki ilk video ya da `?video=`); analizli video yoksa undefined. */
  selection: AnatomySelection | undefined;
  /** Adreste `?video=` vardı: sayfa seçili video paneline kayar ve odak ona gelir (varsayılan seçimde kaydırma yok). */
  scrollToVideo?: boolean;
}

/**
 * Kreatif anatomisi ekranı: video seçici + zaman çizelgesi, özellik tabloları, tutan videoların ortak özellikleri. İncelenmiş video yoksa sebebiyle boş durum.
 * Veri `getAnatomy` (+ Karşılaştırma verisi `getInsights`); burada hesap yoktur.
 */
export function AnatomyView({ report, insights, selection, scrollToVideo = false }: AnatomyViewProps) {
  if (report.counts.analyzed === 0) {
    return (
      <EmptyState
        icon={ScanSearch}
        title={ANATOMY_PLAIN.emptyTitle}
        description={plainOrFallback(report.unmeasured.find((u) => u.section === "videos")?.reason, ANATOMY_PLAIN.emptyFallback)}
      />
    );
  }
  const { counts, scope } = report;
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">
        {ANATOMY_PLAIN.summary(
          formatNumber(scope.days) ?? "",
          formatNumber(counts.analyzed) ?? "0",
          formatNumber(counts.own) ?? "0",
          formatNumber(counts.rivals) ?? "0",
          timesText(scope.winnerMinLift),
          formatNumber(counts.winners) ?? "0",
        )}
      </p>
      <section aria-label={ANATOMY_PLAIN.timeline} className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_1fr]">
        <VideoPicker videos={report.videos} selectedId={selection?.contentId} />
        <div id={SELECTED_VIDEO_ID} tabIndex={-1} className="min-w-0 scroll-mt-4 outline-none">
          {scrollToVideo && selection ? <ScrollToTarget key={selection.contentId} targetId={SELECTED_VIDEO_ID} /> : null}
          <SelectedVideo selection={selection} />
        </div>
      </section>
      <RecipeCard recipe={report.recipe} minLift={scope.winnerMinLift} />
      <DimensionTables report={report} insights={insights} />
    </div>
  );
}
