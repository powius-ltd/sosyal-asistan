import { CircleAlert, ScanSearch, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { AnalysisHook } from "@/components/video/analysis-hook";
import { AnalysisMeta } from "@/components/video/analysis-meta";
import { AnalysisLabels, AnalysisSections } from "@/components/video/analysis-sections";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobCommand } from "@/components/workspace/job-command";
import type { ContentAnalysis } from "@/lib/domain/intel";
import { ANALYSIS_PLAIN } from "@/lib/plain-language-publish";

const UNVERIFIED_NOTE =
  "Bazı alıntılar konuşma, ekran yazısı ya da açıklamada birebir bulunamadı; işaretli alıntıları, etiketleri ve açılış tarzını dikkatle değerlendirin (ayrıntı: Kanıt raporu).";

function AnalysisBody({ analysis }: { analysis: ContentAnalysis }) {
  return (
    <>
      {!analysis.evidenceVerified ? (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>Kanıt doğrulanamadı</AlertTitle>
          <AlertDescription>{UNVERIFIED_NOTE}</AlertDescription>
        </Alert>
      ) : null}
      <AnalysisHook analysis={analysis} />
      <AnalysisSections analysis={analysis} />
      <AnalysisLabels analysis={analysis} />
    </>
  );
}

/** Toplu video analizi işi: analizi olmayan ve başarısız kalan içerikleri sıradan alır (bu içerik seçilen kapsamdaysa o da girer). */
const ANALYZE_JOB = { kind: "analyze" } as const;

/** Analiz yokken sebep: toplu video analizi bu içerik için henüz koşmadı (ya da içerik seçilen kapsamın dışında). */
function NoAnalysis() {
  return (
    <EmptyState
      icon={ScanSearch}
      title="Bu içerik henüz analiz edilmedi"
      description="Video analizi toplu koşar: video geçici indirilir, analiz edilir ve hemen silinir. Analiz bu içerik için henüz koşmadı ya da içerik seçilen analiz kapsamının dışında. Analiz bitince açılış, bölümler, etiketler ve kurgu ölçümleri burada görünür."
      action={<JobCommand request={ANALYZE_JOB} className="items-center" />}
    />
  );
}

function FailedAnalysis({ analysis }: { analysis: ContentAnalysis }) {
  return (
    <>
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertTitle>Analiz başarısız</AlertTitle>
        <AlertDescription>
          {analysis.failureReason ?? "Sebep kaydedilmedi."} Başarısız analizler bir sonraki toplu video analizinde yeniden denenir.
        </AlertDescription>
      </Alert>
      <JobCommand request={ANALYZE_JOB} />
    </>
  );
}

function InsufficientAnalysis({ analysis }: { analysis: ContentAnalysis }) {
  return (
    <Alert>
      <CircleAlert aria-hidden />
      <AlertTitle>Analiz için veri yetersiz</AlertTitle>
      <AlertDescription>
        {analysis.failureReason ?? "Sebep kaydedilmedi."} Konuşma ve ekran yazısı toplamı 8 kelimeden azsa (müzik ya da
        sessiz video) açılış, bölüm ve etiket çıkarılmaz; kurgu ölçümleri yine de altta gösterilir.
      </AlertDescription>
    </Alert>
  );
}

/**
 * Analiz kartı: açılış (kaynak, tür, kanıt alıntısı), bölümler, etiketler ve — yalnız yönetici modunda — künye (arka uç / model / taksonomi / istem sürümü).
 * Başarısız, yetersiz veri ve "analiz yok" durumlarında sebep gösterilir; kurgu ölçümleri ve kanıt raporu ayrı kartlardadır.
 * "Analiz yok" ve "başarısız" durumlarında toplu video analizini başlatan iş düğmesi çizilir (`JobCommand`: yalnız işler panelden
 * başlatılabiliyorken; müşteri görünümünde ne düğme ne komut). Sunucu bileşenidir: istemci bileşeninin içinde çizilmez.
 */
export function AnalysisPanel({ analysis, operator = false }: { analysis?: ContentAnalysis; operator?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Analiz</CardTitle>
        <CardDescription>{ANALYSIS_PLAIN.analysisDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!analysis ? (
          <NoAnalysis />
        ) : analysis.status === "failed" ? (
          <FailedAnalysis analysis={analysis} />
        ) : analysis.status === "insufficient_data" ? (
          <InsufficientAnalysis analysis={analysis} />
        ) : (
          <AnalysisBody analysis={analysis} />
        )}
        {analysis && operator ? <AnalysisMeta analysis={analysis} /> : null}
      </CardContent>
    </Card>
  );
}
