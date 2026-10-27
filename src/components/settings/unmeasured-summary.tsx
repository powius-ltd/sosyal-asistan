import { CircleSlash } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { summarizeUnmeasured } from "@/components/settings/unmeasured-lines";
import type { UnmeasuredEntry } from "@/lib/domain/measured";
import { UNMEASURED_PLAIN } from "@/lib/plain-language-account";

/** Müşteri görünümünde "Ölçülemeyenler": en çok 5 satırlık düz özet (ham tablo ve sütun adları yalnız yönetici modunda). */
export function UnmeasuredSummary({ entries, ownHandles }: { entries: readonly UnmeasuredEntry[]; ownHandles: ReadonlySet<string> }) {
  const lines = summarizeUnmeasured(entries, ownHandles);
  if (lines.length === 0) return <EmptyState icon={CircleSlash} title={UNMEASURED_PLAIN.none} className="py-6" />;
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm" data-testid="unmeasured-summary">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
