import { MeasuredValue } from "@/components/common/measured-value";
import { sectionTypeLabel } from "@/components/video/taxonomy-labels";
import { ANATOMY_PLAIN, PHASE_PLAIN } from "@/lib/anatomy/plain";
import type { AnatomyPhase, PhaseSpan, VideoAnatomy } from "@/lib/domain/anatomy";
import { formatDecimal, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Faz renkleri (CSS çubuk; yeni kütüphane yok). Açık/koyu temada okunur. */
const PHASE_COLOR: Record<AnatomyPhase, string> = {
  hook: "bg-phase-hook",
  intro: "bg-phase-intro",
  body: "bg-phase-body",
  cta: "bg-phase-cta",
};

const rangeText = (span: PhaseSpan): string | undefined => {
  const start = formatDuration(span.startSec);
  const end = formatDuration(span.endSec);
  return start === undefined && end === undefined ? undefined : `${start ?? "?"}–${end ?? "?"}`;
};

/** Faz çubuğu: tüm parçaların süresi biliniyorsa süreyle orantılı, değilse eşit genişlik (ölçekli değil; not düşülür). */
function bars(spans: readonly PhaseSpan[]): { widths: number[]; scaled: boolean } {
  const total = spans.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
  const scaled = spans.length > 0 && total > 0 && spans.every((s) => s.durationSec !== undefined);
  return { scaled, widths: spans.map((s) => (scaled ? ((s.durationSec as number) / total) * 100 : 100 / spans.length)) };
}

function ScreenTextRow({ anatomy }: { anatomy: VideoAnatomy }) {
  const times = anatomy.screenTextAtSec;
  const count = anatomy.editMetrics?.onScreenTextCount;
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <span>{ANATOMY_PLAIN.phases.screenText}</span>
      <MeasuredValue
        value={times === undefined ? undefined : times.map((t) => formatDuration(t)).join(" · ")}
        reason={anatomy.unmeasured.screenText ?? "Ekran yazısı zamanları ölçülemedi."}
        className="text-foreground"
      />
      {count !== undefined ? <span>(toplam {count} adet)</span> : null}
    </div>
  );
}

/** Videonun faz zaman çizelgesi: renkli faz çubuğu + her fazın bölüm alıntıları (zamanlı) + ekran yazısı zamanları. */
export function PhaseTimeline({ anatomy }: { anatomy: VideoAnatomy }) {
  const { phases } = anatomy;
  if (phases.length === 0) {
    return <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">{anatomy.unmeasured.phases ?? ANATOMY_PLAIN.phases.noSections}</p>;
  }
  const { widths, scaled } = bars(phases);

  return (
    <div className="flex flex-col gap-4">
      <div
        role="img"
        aria-label={`${ANATOMY_PLAIN.phases.ariaLabel}: ${phases.map((p) => `${PHASE_PLAIN[p.phase]} ${rangeText(p) ?? ANATOMY_PLAIN.phases.unknownTime}`).join(", ")}`}
        className="flex h-8 w-full gap-0.5 overflow-hidden rounded-md"
      >
        {phases.map((span, index) => (
          <div
            key={`${span.phase}:${index}`}
            className={cn("flex min-w-0 items-center justify-center overflow-hidden text-[11px] font-medium text-solid-foreground", PHASE_COLOR[span.phase])}
            style={{ width: `${widths[index]}%` }}
            data-phase={span.phase}
          >
            <span className="truncate px-1">{PHASE_PLAIN[span.phase]}</span>
          </div>
        ))}
      </div>
      {scaled ? null : (
        <p className="text-xs text-muted-foreground">{ANATOMY_PLAIN.phases.unscaled}</p>
      )}

      <ol className="flex flex-col gap-3">
        {phases.map((span, index) => (
          <li key={`${span.phase}:${index}`} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={cn("size-2.5 rounded-full", PHASE_COLOR[span.phase])} aria-hidden />
              <span className="font-medium">{PHASE_PLAIN[span.phase]}</span>
              <span className="text-muted-foreground tabular">
                <MeasuredValue value={rangeText(span)} reason="Bölüm zamanı ölçülemedi." />
              </span>
              <span className="text-xs text-muted-foreground tabular">
                <MeasuredValue
                  value={span.durationSec === undefined ? undefined : `${formatDecimal(span.durationSec, 0)} sn`}
                  reason="Faz süresi hesaplanamadı: bölümün başlangıç ya da bitişi bilinmiyor."
                />
              </span>
            </div>
            <ul className="flex flex-col gap-1 pl-4">
              {span.sections.map((section, i) => (
                <li key={`${section.type}:${i}`} className="grid grid-cols-[7rem_1fr_auto] items-start gap-x-3 text-sm">
                  <span className="text-xs text-muted-foreground">{sectionTypeLabel(section.type)}</span>
                  <span>“{section.quote}”</span>
                  <span className="text-xs text-muted-foreground tabular">
                    <MeasuredValue value={formatDuration(section.startSec)} reason="Bu bölümün başlangıç saniyesi alınamadı." />
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <ScreenTextRow anatomy={anatomy} />
    </div>
  );
}
