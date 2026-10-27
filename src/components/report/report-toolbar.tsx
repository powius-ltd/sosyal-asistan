import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { PrintButton } from "@/components/report/print-button";
import { REPORT_COPY } from "@/lib/copy/report";
import { TAP } from "@/components/weekly-plan/tap-target";
import { thisWeekFor } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Rapor sayfasının ekran araç çubuğu: panele dön + tek düğme ("PDF olarak kaydet" = yazdırma penceresi). Yazdırmada hiç çıkmaz (`print:hidden`). */
export function ReportToolbar({ weekStart, printable = true }: { weekStart?: string; printable?: boolean }) {
  return (
    <div className="mx-auto mb-4 flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={thisWeekFor(weekStart)} className={cn("inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground", TAP)}>
        <ArrowLeft className="size-4" aria-hidden />
        {REPORT_COPY.backToPanel}
      </Link>
      {/* Plan yoksa kaydedilecek rapor da yok: düğme çizilmez. */}
      {printable ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{REPORT_COPY.printHint}</span>
          <PrintButton />
        </div>
      ) : null}
    </div>
  );
}
