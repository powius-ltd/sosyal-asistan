import { Hint } from "@/components/common/hint";
import { COMPLIANCE_STATUS_LABEL } from "@/components/publish/publish-labels";
import { Badge } from "@/components/ui/badge";
import type { ComplianceResult, ComplianceStatus } from "@/lib/domain/compliance";
import type { PublishJob } from "@/lib/domain/publish";
import { trialBadgeText } from "@/lib/plain-language-publish";
import { cn } from "@/lib/utils";

const DOT_TONE: Record<ComplianceStatus, string> = {
  ok: "bg-success-solid",
  warn: "bg-warning-solid",
  fail: "bg-destructive",
};

/** İşin uyum/yayın türü rozetleri: "Ücretli iş birliği", "YZ", "Deneme yayını (elle açılır / otomatik açılır)". Hiçbiri yoksa hiçbir şey çizmez. */
export function JobFlagBadges({ job }: { job: Pick<PublishJob, "paidPartnership" | "aiGenerated" | "advertiserName" | "trial"> }) {
  return (
    <>
      {job.paidPartnership ? (
        <Badge variant="outline" title={job.advertiserName ? `Reklam veren: ${job.advertiserName}` : undefined}>
          Ücretli iş birliği
        </Badge>
      ) : null}
      {job.aiGenerated ? (
        <Badge variant="outline" title="Yapay zekâ ile üretildi">
          YZ
        </Badge>
      ) : null}
      {job.trial?.enabled ? <Badge variant="outline">{trialBadgeText(job.trial.graduation)}</Badge> : null}
    </>
  );
}

/** Uyum durumu noktası (ok/warn/fail); üzerine gelince ilk bulgu (kalan sayısıyla) ya da "sorun yok" görünür. */
export function ComplianceDot({ result }: { result: ComplianceResult }) {
  const first = result.findings[0];
  const rest = result.findings.length - 1;
  const tip = first ? `${first.message}${rest > 0 ? ` (+${rest} bulgu daha)` : ""}` : "Bu bölgenin kurallarına göre bulgu yok.";
  const status = COMPLIANCE_STATUS_LABEL[result.status];
  return (
    <Hint content={tip} label={`Uyum denetimi: ${status}. ${tip}`}>
      <span data-status={result.status} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("size-2 rounded-full", DOT_TONE[result.status])} aria-hidden />
        {status}
      </span>
    </Hint>
  );
}
