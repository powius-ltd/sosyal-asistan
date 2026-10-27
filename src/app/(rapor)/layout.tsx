import type { Metadata } from "next";
import type { ReactNode } from "react";

import { LightThemeScript } from "@/components/report/light-theme-script";

// Rapor çalışma alanına özel veriyi okur (`getPanelContext`): derleme anında statik üretilmez.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * A4 dikey, kenar boşluğu yazıcı sayfasında (`@page`); kâğıda zemin rengi basılmaz. Renk değeri yok: kâğıt/yazı renkleri sayfadaki
 * belirteç sınıflarından gelir.
 */
const PRINT_CSS = `@page { size: A4 portrait; margin: 14mm 16mm; } @media print { html, body { background: none !important; } }`;

/**
 * Yazdırılabilir rapor düzeni: panel kabuğu (kenar çubuğu, üst şerit, alt sekme, sohbet düğmesi) YOK. Kabuğu bu ayrı rota grubu
 * (`(rapor)`) kökten dışarıda bırakır; `(panel)/layout.tsx` kabuğu ve veriyi bir arada kurduğu için CSS ile gizlemek hem gereksiz
 * veri okur hem de `h-dvh overflow-hidden` ana alanı yüzünden sayfaları keser. Kök düzen (`app/layout.tsx`) yazı tipi ve tema belirteçlerini verir.
 */
export default function ReportLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LightThemeScript />
      <style>{PRINT_CSS}</style>
      <div className="min-h-dvh bg-muted px-4 py-6 print:bg-transparent print:p-0">{children}</div>
    </>
  );
}
