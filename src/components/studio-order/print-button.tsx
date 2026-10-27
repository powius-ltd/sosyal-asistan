"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TAP } from "@/components/weekly-plan/tap-target";
import { TICKET_COPY } from "@/lib/copy/studio-order";

/** Tarayıcının yazdırma penceresini açar; düğmenin kendisi çıktıda görünmez (`print:hidden`). */
export function PrintTicketButton() {
  return (
    <Button type="button" variant="outline" size="sm" className={`${TAP} print:hidden`} onClick={() => window.print()}>
      <Printer aria-hidden />
      {TICKET_COPY.print}
    </Button>
  );
}
