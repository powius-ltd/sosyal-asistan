"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TAP } from "@/components/weekly-plan/tap-target";
import { REPORT_COPY } from "@/lib/copy/report";

/** Tarayıcının yazdırma penceresini açar (hedef olarak "PDF olarak kaydet" seçilir). Yazdırmada gizlenen araç çubuğunda durur. */
export function PrintButton() {
  return (
    <Button type="button" className={TAP} onClick={() => window.print()}>
      <Printer aria-hidden />
      {REPORT_COPY.printButton}
    </Button>
  );
}
