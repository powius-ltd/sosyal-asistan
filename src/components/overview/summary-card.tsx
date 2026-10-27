import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AiByline, AiSurface, AiVoice } from "@/components/common/ai-surface";
import { WhyDisclosure } from "@/components/common/why-disclosure";
import { linkButtonClass } from "@/components/content/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NO_ASKS_TEXT } from "@/lib/overview/summary";
import type { OverviewSummary, SummaryAsk, SummaryLine, SummaryLink } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

/** Satır başlığının yanındaki "Neden?" bağlantısı: 48 px yüksekliğinde dokunma alanı, satırı uzatmaz (negatif dikey boşluk). */
function LineLink({ link }: { link: SummaryLink }) {
  return (
    <Link
      href={link.href}
      className="col-start-2 row-start-1 -my-3.5 inline-flex min-h-tap shrink-0 items-center gap-1 px-1 text-sm font-medium underline-offset-4 hover:underline"
    >
      {link.label}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/**
 * Özet satırı: başlık solda, "Neden?" bağlantısı sağda (ızgara), cümle altta. DOM sırası başlık → cümle → bağlantı: ekran okuyucu
 * bağlantıyı okuduğu cümleden SONRA duyar ("Hangileri?" neyin hangileri olduğu bilinerek).
 */
function SummaryRow({ label, line, children }: { label: string; line?: SummaryLine; children?: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      <h3 className="col-start-1 row-start-1 min-h-5 text-xs font-medium text-ai-meta">{label}</h3>
      {line ? <AiVoice className="col-span-2 row-start-2">{line.text}</AiVoice> : null}
      {line?.link ? <LineLink link={line.link} /> : null}
      {children ? <div className="col-span-2 row-start-2">{children}</div> : null}
    </div>
  );
}

/** Tek iş: tek cümle + tek düğme. Birincil iş dolu düğme, diğerleri çerçeveli; düğme ≥ 44 px (mobilde tam genişlik). */
function AskRow({ ask, primary }: { ask: SummaryAsk; primary: boolean }) {
  return (
    <li className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4" data-ask={ask.id}>
      <AiVoice>{ask.text}</AiVoice>
      <Link href={ask.action.href} className={cn(linkButtonClass(primary ? "default" : "outline", "touch"), "w-full sm:w-auto sm:shrink-0")}>
        {ask.action.label}
      </Link>
    </li>
  );
}

/** "Senden beklediğim": iş varsa kartın TEK çerçeveli bloğudur ("sıra sende"); iş yoksa düz satır. */
function AsksRow({ asks }: { asks: SummaryAsk[] }) {
  const [first, ...rest] = asks;
  if (first === undefined) {
    return (
      <SummaryRow label="Senden beklediğim">
        <AiVoice>{NO_ASKS_TEXT}</AiVoice>
      </SummaryRow>
    );
  }
  return (
    <div className="rounded-md border border-awaiting-border bg-awaiting-soft p-3" data-slot="summary-asks">
      <SummaryRow label="Senden beklediğim">
        <ul className="flex flex-col gap-3" aria-label="Senden beklediğim işler">
          <AskRow ask={first} primary />
          {rest.length > 0 ? (
            <li>
              <WhyDisclosure label={`+${rest.length} iş daha`} surface={false}>
                <ul className="flex flex-col gap-3">
                  {rest.map((ask) => (
                    <AskRow key={ask.id} ask={ask} primary={false} />
                  ))}
                </ul>
              </WhyDisclosure>
            </li>
          ) : null}
        </ul>
      </SummaryRow>
    </div>
  );
}

interface SummaryCardProps {
  summary: OverviewSummary;
  /** Maskot adı (`maskotName()`, sayfa okur ve geçirir): "ben" diyen kimin olduğunu söyler. */
  maskotName: string;
  className?: string;
}

/**
 * Genel bakışın ilk bloğu: neredeyiz · bu hafta ne yaptık · senden ne bekliyoruz. Metin `buildOverviewSummary`'den gelir (şablon,
 * LLM yok); "ben" diyen Maskot olduğu için AI yüzeyinde (kenar çizgisi + serif) yazılır. Boş çalışma alanında ikinci satır çizilmez.
 * Mobilde tek sütun; ilk iş tam genişlikte 44 px düğmedir.
 */
export function SummaryCard({ summary, maskotName, className }: SummaryCardProps) {
  return (
    <Card className={className} data-testid="overview-summary">
      <CardHeader>
        <CardTitle className="text-lg">Özet</CardTitle>
        <AiByline author={maskotName} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {summary.where || summary.done ? (
          <AiSurface className="gap-4">
            {summary.where ? <SummaryRow label="Neredeyiz" line={summary.where} /> : null}
            {summary.done ? <SummaryRow label="Bu hafta ne yaptık" line={summary.done} /> : null}
          </AiSurface>
        ) : null}
        <AsksRow asks={summary.asks} />
      </CardContent>
    </Card>
  );
}
