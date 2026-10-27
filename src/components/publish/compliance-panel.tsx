import { CircleCheck, CircleX, TriangleAlert, type LucideIcon } from "lucide-react";

import { COMPLIANCE_STATUS_LABEL, REGION_SHORT_LABEL } from "@/components/publish/publish-labels";
import { COMPLIANCE_NOTE } from "@/lib/plain-language-publish";
import { Badge } from "@/components/ui/badge";
import type { ComplianceRegion, ComplianceResult, ComplianceSeverity, ComplianceStatus } from "@/lib/domain/compliance";
import { cn } from "@/lib/utils";

export interface CompliancePanelProps {
  /** `checkCompliance` sonucu (saf fonksiyon: istemcide canlı, sunucuda kayıtlı iş için). */
  result: ComplianceResult;
  /** Denetimin uygulandığı bölge; verilirse başlıkta etiketlenir (TR / ABD / TR+ABD). */
  region?: ComplianceRegion;
  /** Yönetici modu: bulgunun altında kural kodu da görünür (müşteri görünümünde kod yok). */
  showRuleIds?: boolean;
}

const STATUS_ICON: Record<ComplianceStatus, LucideIcon> = { ok: CircleCheck, warn: TriangleAlert, fail: CircleX };

const STATUS_TONE: Record<ComplianceStatus, string> = {
  ok: "border-success-solid/40 bg-success-solid/5",
  warn: "border-warning-solid/50 bg-warning-solid/5",
  fail: "border-destructive/40 bg-destructive/5",
};

const STATUS_TEXT: Record<ComplianceStatus, string> = {
  ok: "text-success-strong",
  warn: "text-warning-strong",
  fail: "text-destructive",
};

const SEVERITY_LABEL: Record<ComplianceSeverity, string> = { fail: "Engel: ", warn: "Uyarı: " };

/**
 * Uyum denetimi paneli (yeni yayın + onay dialog'u): durum başlığı (Uyumlu / Dikkat / Onaylanamaz), bulgular (mesaj +
 * düzeltme ipucu; yönetici modunda kural kimliği de), bölge etiketi ve "hukuki tavsiye değildir" notu. Yalnız gösterir: düğmeleri
 * devre dışı bırakma (`fail`) dialog'un işidir; asıl engel depoda uygulanır.
 */
export function CompliancePanel({ result, region, showRuleIds = false }: CompliancePanelProps) {
  const StatusIcon = STATUS_ICON[result.status];
  return (
    <section
      aria-label="Uyum denetimi"
      data-status={result.status}
      className={cn("flex flex-col gap-2.5 rounded-lg border p-3 text-sm", STATUS_TONE[result.status])}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={cn("flex items-center gap-1.5 font-medium", STATUS_TEXT[result.status])}>
          <StatusIcon className="size-4 shrink-0" aria-hidden />
          {COMPLIANCE_STATUS_LABEL[result.status]}
        </p>
        {region ? <Badge variant="outline">Bölge: {REGION_SHORT_LABEL[region]}</Badge> : null}
      </div>

      {result.findings.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {result.findings.map((finding) => {
            const FindingIcon = finding.severity === "fail" ? CircleX : TriangleAlert;
            return (
              <li key={finding.ruleId} data-severity={finding.severity} className="flex items-start gap-2">
                <FindingIcon
                  className={cn("mt-0.5 size-4 shrink-0", finding.severity === "fail" ? "text-destructive" : "text-warning")}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p>
                    <span className="sr-only">{SEVERITY_LABEL[finding.severity]}</span>
                    {finding.message}
                  </p>
                  {finding.hint ? <p className="text-muted-foreground">{finding.hint}</p> : null}
                  {showRuleIds ? <code className="w-fit text-[10px] text-muted-foreground">{finding.ruleId}</code> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground">Seçili bölgenin kurallarına göre bulgu yok.</p>
      )}

      <p className="text-xs text-muted-foreground">{COMPLIANCE_NOTE}</p>
    </section>
  );
}
