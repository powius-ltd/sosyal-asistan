import { Badge } from "@/components/ui/badge";
import { REVISE_COPY } from "@/lib/copy/studio-order-revise";
import type { OrderRevisionEntry } from "@/lib/domain/studio-order";
import { formatDateTime } from "@/lib/format";

/** "2. sürüm" rozeti: yalnız revize edilmiş videoda (sürüm 2 ve sonrası) çizilir. */
export function RevisionBadge({ revision }: { revision: number }) {
  if (revision < 2) return null;
  return <Badge variant="secondary">{REVISE_COPY.badge(revision)}</Badge>;
}

/**
 * Önceki revize istekleri (yeni → eski olmaz: sürüm sırasıyla). Sunucu bileşeni; açılır kutu yerel `details`. Müşteri ne istediğini ve kaçıncı
 * sürümde olduğunu görür; eski sürümün videosu silinmez ama burada gösterilmez (yayına girmez).
 */
export function RevisionHistory({ entries, timeZone }: { entries: readonly OrderRevisionEntry[]; timeZone: string }) {
  if (entries.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="min-h-tap cursor-pointer text-muted-foreground hover:text-foreground md:min-h-0">{REVISE_COPY.historyTitle(entries.length)}</summary>
      <ol className="mt-2 flex flex-col gap-2 border-l-2 pl-3">
        {entries.map((entry) => (
          <li key={entry.version} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {REVISE_COPY.historyItem(entry.version)} · {formatDateTime(entry.requestedAt, timeZone) ?? entry.requestedAt}
            </span>
            <span className="whitespace-pre-line">{entry.note}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
