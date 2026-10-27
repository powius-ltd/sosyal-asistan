import { CircleSlash } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PlatformBadge } from "@/components/common/platform-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UnmeasuredEntry, UnmeasuredScope } from "@/lib/domain/measured";
import { formatDateTime } from "@/lib/format";

const SCOPE_LABEL: Record<UnmeasuredScope, string> = {
  content: "İçerik",
  competitor: "Rakip",
  account: "Hesap",
  source: "Kaynak",
};

/**
 * "Ölçülemeyenler" listesi (`repo.listUnmeasured`): neyin neden ölçülemediği.
 * Dürüstlük yüzeyi — eksik veri saklanmaz, sebebiyle birlikte gösterilir.
 */
export function UnmeasuredList({ entries, timeZone }: { entries: UnmeasuredEntry[]; timeZone?: string }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={CircleSlash}
        title="Ölçülemeyen alan yok"
        description="Şu an tüm kaynaklardan beklenen veriler alınabildi."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tür</TableHead>
          <TableHead>Konu</TableHead>
          <TableHead>Alan</TableHead>
          <TableHead>Sebep</TableHead>
          <TableHead>Kaynak</TableHead>
          <TableHead className="text-right">Görülme</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, index) => (
          <TableRow key={`${entry.scope}:${entry.refId ?? entry.subject}:${entry.field ?? ""}:${index}`}>
            <TableCell>{SCOPE_LABEL[entry.scope]}</TableCell>
            <TableCell className="whitespace-normal">
              <span className="flex flex-wrap items-center gap-1.5">
                {entry.subject}
                {entry.platform ? <PlatformBadge platform={entry.platform} /> : null}
              </span>
            </TableCell>
            <TableCell className="font-mono text-xs">{entry.field ?? "—"}</TableCell>
            <TableCell className="whitespace-normal text-muted-foreground">{entry.reason}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{entry.source}</TableCell>
            <TableCell className="text-right tabular text-muted-foreground">
              {formatDateTime(entry.seenAt, timeZone) ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
