import { History, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Hint } from "@/components/common/hint";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RUN_KIND_LABEL, RUN_PROVIDER_LABEL, RUN_STATUS_LABEL, RUN_STATUS_STYLE } from "@/components/settings/run-labels";
import type { CollectionRun } from "@/lib/domain/run";
import { formatDateTime, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Gerçek tutar: mutabakat yapılmadıysa (undefined) "mutabakat bekliyor" — 0 DEĞİL. */
function ActualCell({ run }: { run: CollectionRun }) {
  if (run.actualUsd === undefined) {
    return (
      <Hint content="Gerçek tutar henüz sağlayıcıdan okunmadı (mutabakat yapılmadı); 0 anlamına gelmez." label="Mutabakat bekliyor">
        <span className="text-xs text-muted-foreground italic">mutabakat bekliyor</span>
      </Hint>
    );
  }
  return <>{formatUsd(run.actualUsd)}</>;
}

/** Son koşular: sağlayıcı, tür, hedef, durum, rezerve/gerçek USD, tarih. */
export function RunsTable({ runs, timeZone }: { runs: CollectionRun[]; timeZone: string }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Henüz koşu yok"
        description="Rakip ekleyince ya da analiz başlatınca paralı çağrılar burada görünür."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Sağlayıcı</TableHead>
          <TableHead>Tür</TableHead>
          <TableHead>Hedef</TableHead>
          <TableHead>Durum</TableHead>
          <TableHead className="text-right">Rezerve</TableHead>
          <TableHead className="text-right">Gerçek</TableHead>
          <TableHead className="text-right">Tarih</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id}>
            <TableCell>{RUN_PROVIDER_LABEL[run.provider]}</TableCell>
            <TableCell>{RUN_KIND_LABEL[run.kind]}</TableCell>
            <TableCell className="max-w-56 truncate" title={run.targetLabel}>
              {run.targetLabel ?? "—"}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className={cn("border-transparent", RUN_STATUS_STYLE[run.status])}>
                  {RUN_STATUS_LABEL[run.status]}
                </Badge>
                {run.error ? (
                  <Hint content={run.error} label={`Hata: ${run.error}`}>
                    <TriangleAlert className="size-3.5 text-destructive" aria-hidden />
                  </Hint>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-right tabular">
              <span className="inline-flex items-center gap-1">
                {run.priceUnknown ? (
                  <Hint content="Sağlayıcı fiyatı okunamadı; rezerve tutar muhafazakâr bir tahmindir." label="Fiyat okunamadı">
                    <TriangleAlert className="size-3.5 text-warning" aria-hidden />
                  </Hint>
                ) : null}
                {formatUsd(run.reservedUsd)}
              </span>
            </TableCell>
            <TableCell className="text-right tabular">
              <ActualCell run={run} />
            </TableCell>
            <TableCell className="text-right tabular text-muted-foreground">
              {formatDateTime(run.startedAt, timeZone) ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
