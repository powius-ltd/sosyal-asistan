import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Instrument_Sans, Newsreader } from "next/font/google";

import { isCopyEdition } from "@/lib/edition";
import { THEME_INIT_SCRIPT } from "@/lib/theme/theme-script";

import "./globals.css";

// latin-ext: ı İ ğ Ğ ş Ş ç Ç ö Ö ü Ü eksiksiz görünsün.
// Arayüz ve gövde.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// AI'ın sesi ve başlıklar (`--font-voice`): serif gördüğün cümleyi AI yazdı.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  display: "swap",
});

// Başlık, rakam ve dev saat (`--font-figure`).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    // Ürün adı karar bekliyor (`URUN-YOL-HARITASI` §4): depo adı müşteriye görünmez, sekme başlığı yalnız ekran adıdır.
    default: "Panel",
    template: "%s",
  },
  description: "Kısa video yönetim paneli: rakip keşfi, tutan içerik analizi, fikir kartları ve onaylı yayın.",
};

/**
 * Mobil: `viewportFit: "cover"` güvenli alan dolgusunu (`env(safe-area-inset-*)`) açar; `resizes-content` ekran klavyesi
 * açılınca düzen görünümünü (dvh) küçültür, böylece alt çubuk klavyenin üstünde kalır.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Müşteri kopyası: `data-edition="kopya"` krem + yeşil belirteçleri açar (`tokens-kopya.css`); yalnız açık tema (tema betiği yok, `dark` sınıfı eklenmez).
  const copy = isCopyEdition();
  return (
    // `suppressHydrationWarning`: `<head>`'teki tema betiği ilk boyamadan önce `<html>`'e `dark` sınıfını koyar (bilerek).
    <html
      lang="tr"
      suppressHydrationWarning
      data-edition={copy ? "kopya" : undefined}
      className={`${instrumentSans.variable} ${newsreader.variable} ${bricolage.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>{copy ? null : <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />}</head>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
