import { FileDown } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { TAP } from "@/components/weekly-plan/tap-target";
import { REPORT_COPY } from "@/lib/copy/report";
import { weeklyReportFor } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * "PDF olarak kaydet": yazdırılabilir rapor sayfasını yeni sekmede açar (orada aynı adlı düğme yazdırma penceresini açar). Yeni sekme tam sayfa yüklemesidir:
 * rapor kendi (kabuksuz, açık temalı) düzeniyle gelir. Çağıran, planı olmayan haftada bu bağlantıyı çizmez.
 */
export function ReportPdfLink({ weekStart }: { weekStart: string }) {
  return (
    <Link href={weeklyReportFor(weekStart)} target="_blank" rel="noopener noreferrer" prefetch={false} className={cn(buttonVariants({ variant: "outline" }), TAP)}>
      <FileDown aria-hidden />
      {REPORT_COPY.pdfButton}
      <span className="sr-only">{REPORT_COPY.pdfOpensNewTab}</span>
    </Link>
  );
}
