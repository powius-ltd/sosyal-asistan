import { Heading, Quote } from "@/components/video/analysis-parts";
import { MeasuredValue } from "@/components/common/measured-value";
import type { EditMetrics, HookSource, TranscriptSegment } from "@/lib/domain/intel";
import { formatDuration, formatNumber } from "@/lib/format";

/**
 * Transcript kartının "Ekran yazısı" kanalı: videoya basılan yazı, konuşmadan AYRI tutulur. `Transcript.text` yalnız konuşmadır;
 * ekran yazısının tam dökümü `segments`'tedir (zaman + metin, sırayla). Segment yoksa (eski analiz, süresi dolmuş transcript)
 * yalnız adet (kurgu ölçümü) ve hook'a dönüşen yazı görünür.
 */
export function ScreenTextChannel({
  hookText,
  hookSource,
  editMetrics,
  segments,
}: {
  hookText?: string;
  hookSource?: HookSource;
  editMetrics?: EditMetrics;
  segments?: readonly TranscriptSegment[];
}) {
  const hookIsScreenText = hookSource === "screen_text" && hookText !== undefined && hookText.trim() !== "";
  const screenSegments = (segments ?? []).filter((segment) => segment.channel === "screen");
  const isHook = (segment: TranscriptSegment) => hookIsScreenText && segment.text === hookText?.trim();

  return (
    <section className="flex flex-col gap-2" aria-label="Ekran yazısı kanalı">
      <Heading>Ekran yazısı</Heading>
      <p className="text-sm">
        Ekrana basılan yazı:{" "}
        <MeasuredValue
          value={editMetrics?.onScreenTextCount ?? (screenSegments.length > 0 ? screenSegments.length : undefined)}
          format={(n) => `${formatNumber(n)} adet`}
          reason="Ekran yazısı sayısı ölçülemedi (video analiz edilmemiş ya da bu analizde kaydedilmemiş)."
        />
      </p>
      {hookIsScreenText ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Açılış bu kanaldan: ekrandaki yazı.</p>
          {screenSegments.some(isHook) ? null : <Quote>{hookText}</Quote>}
        </div>
      ) : null}
      {screenSegments.length > 0 ? (
        <ol className="flex flex-col gap-1 text-sm" aria-label="Ekran yazısı dökümü">
          {screenSegments.map((segment, index) => (
            <li key={`${segment.startSec}-${index}`} className="flex gap-2">
              <span className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDuration(segment.startSec) ?? "—"}</span>
              <span className={isHook(segment) ? "font-medium" : undefined}>{segment.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">Ekran yazısının tam dökümü bu analizde kaydedilmemiş.</p>
      )}
    </section>
  );
}
