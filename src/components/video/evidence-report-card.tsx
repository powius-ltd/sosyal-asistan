import { CircleCheck, TriangleAlert } from "lucide-react";

import { MeasuredValue } from "@/components/common/measured-value";
import { EVIDENCE_CHANNEL_LABEL, EVIDENCE_FAILURE_LABEL, evidenceTargetLabel } from "@/components/video/evidence-labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MIN_MEANINGFUL_WORDS, type ContentAnalysis, type EvidenceReport } from "@/lib/domain/intel";
import { formatNumber } from "@/lib/format";
import { ANALYSIS_PLAIN } from "@/lib/plain-language-publish";
import { cn } from "@/lib/utils";

const VERIFIED_STYLE = "border-transparent bg-success-soft text-success-soft-foreground";
const UNVERIFIED_STYLE = "border-transparent bg-warning-soft text-warning-soft-foreground";

function VerdictBadge({ verified }: { verified: boolean }) {
  const Icon = verified ? CircleCheck : TriangleAlert;
  return (
    <Badge variant="outline" className={cn("gap-1", verified ? VERIFIED_STYLE : UNVERIFIED_STYLE)} data-verified={verified}>
      <Icon aria-hidden />
      {verified ? "Doğrulandı" : "Doğrulanamadı"}
    </Badge>
  );
}

function ReportDetails({ report }: { report: EvidenceReport }) {
  return (
    <>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Doğrulanan alıntı</dt>
        <dd className="text-right tabular">
          {report.checked === 0 ? "Denetlenecek alıntı yok" : `${formatNumber(report.passed)} / ${formatNumber(report.checked)}`}
        </dd>
        <dt className="text-muted-foreground">Açılışın geldiği kanal</dt>
        <dd className="text-right">
          <MeasuredValue
            value={report.hookChannel ? EVIDENCE_CHANNEL_LABEL[report.hookChannel] : undefined}
            reason="Açılış hiçbir kanalda doğrulanamadı."
          />
        </dd>
        <dt className="text-muted-foreground">Metin miktarı</dt>
        <dd className="text-right tabular">{formatNumber(report.corpusWords)} kelime (konuşma + ekran yazısı)</dd>
      </dl>

      {report.insufficientData ? (
        <p className="text-sm text-muted-foreground">
          Metin {MIN_MEANINGFUL_WORDS} kelimeden az: analiz için yetersiz sayılır.
        </p>
      ) : null}

      {report.failures.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Doğrulanamayan alıntılar</p>
          <ul className="flex flex-col gap-2">
            {report.failures.map((failure, index) => (
              <li key={`${failure.target}:${failure.key ?? ""}:${index}`} className="flex flex-col gap-0.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">
                  {evidenceTargetLabel(failure.target, failure.key)}
                </span>
                <span>{failure.quote ? `“${failure.quote}”` : "(boş alıntı)"}</span>
                <span className="text-xs text-warning-detail">
                  {failure.failure ? EVIDENCE_FAILURE_LABEL[failure.failure] : EVIDENCE_FAILURE_LABEL.not_found}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/**
 * Kanıt raporu: alıntı denetiminin sonucu (doğrulandı rozeti, açılışın kanalı, doğrulanamayan alıntılar). Rapor yoksa (eski
 * analiz) yalnız genel sonuç (`evidenceVerified`) gösterilir. Not: aynı model metni ve alıntıyı ürettiği için bu bağımsız
 * bir doğrulama değil, öz-tutarlılık denetimidir (docs/FAZ2-PLAN.md §3).
 */
export function EvidenceReportCard({ analysis }: { analysis: Pick<ContentAnalysis, "evidenceVerified" | "evidenceReport"> }) {
  const { evidenceVerified, evidenceReport } = analysis;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kanıt raporu</CardTitle>
        <CardDescription>Açılış, bölüm ve etiket alıntıları videodaki metinde aranarak denetlenir.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <VerdictBadge verified={evidenceVerified} />
        </div>
        {evidenceReport ? (
          <ReportDetails report={evidenceReport} />
        ) : (
          <p className="text-sm text-muted-foreground">Denetim ayrıntısı bu analizde kaydedilmemiş (eski analiz sürümü).</p>
        )}
        <p className="border-t pt-3 text-xs text-muted-foreground">
          {ANALYSIS_PLAIN.evidenceSelfCheck}
        </p>
      </CardContent>
    </Card>
  );
}
