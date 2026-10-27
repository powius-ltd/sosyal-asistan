import { Hint } from "@/components/common/hint";
import { MeasuredValue } from "@/components/common/measured-value";
import { PlatformBadge } from "@/components/common/platform-badge";
import { CompetitorStatusActions } from "@/components/competitors/status-actions";
import { STACK_CELL, STACK_FULL, STACK_LABEL, STACK_ROW, STACK_TABLE } from "@/components/competitors/stack-table";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DiscoveryCandidateView } from "@/lib/domain/competitor";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import { formatCompact, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Kaynak etiketi: related → "<Platform> önerisi", search → "Arama". */
function sourceLabel(candidate: DiscoveryCandidateView): string {
  return candidate.source === "related" ? `${PLATFORM_LABEL[candidate.platform]} önerisi` : "Arama";
}

/** "Hangi hesaptan geldi": related → hesap adı, search → arama sorgusu. */
function ViaCell({ candidate }: { candidate: DiscoveryCandidateView }) {
  if (!candidate.via) {
    return <MeasuredValue value={undefined} reason="Bu adayı hangi hesabın/sorgunun getirdiği kaydedilmemiş." />;
  }
  return candidate.source === "related" ? (
    <span>
      <span className="font-mono text-xs">@{candidate.via.replace(/^@+/, "")}</span> hesabından
    </span>
  ) : (
    <span>
      “{candidate.via}” araması
    </span>
  );
}

function SizeCell({ similarSize }: { similarSize: boolean | undefined }) {
  if (similarSize === undefined) {
    return (
      <MeasuredValue
        value={undefined}
        reason="Boy karşılaştırılamadı: adayın ya da kendi hesabının takipçi sayısı ölçülemedi."
      />
    );
  }
  return similarSize ? (
    <Hint content="Takipçi sayısı kendi hesabının ±3 katı aralığında." label="Benzer boy">
      <Badge variant="secondary">Benzer boy</Badge>
    </Hint>
  ) : (
    <span className="text-xs text-muted-foreground">Farklı boy</span>
  );
}

export function DiscoveryTable({ candidates, timeZone }: { candidates: DiscoveryCandidateView[]; timeZone?: string }) {
  return (
    <Table className={STACK_TABLE}>
      <TableHeader>
        <TableRow>
          <TableHead>Hesap</TableHead>
          <TableHead>Platform</TableHead>
          <TableHead>Kaynak</TableHead>
          <TableHead>Nereden</TableHead>
          <TableHead className="text-right">Takipçi</TableHead>
          <TableHead>Boy</TableHead>
          <TableHead>Bulunma</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Eylemler</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {candidates.map((c) => (
          <TableRow key={c.competitorId} data-candidate={c.handle} className={STACK_ROW}>
            <TableCell className={cn(STACK_CELL, STACK_FULL)}>
              <div className="min-w-0">
                <div className="truncate font-medium">@{c.handle}</div>
                {c.displayName ? <div className="truncate text-xs text-muted-foreground">{c.displayName}</div> : null}
              </div>
            </TableCell>
            <TableCell data-label="Platform" className={cn(STACK_CELL, STACK_LABEL)}>
              <PlatformBadge platform={c.platform} />
            </TableCell>
            <TableCell data-label="Kaynak" className={cn(STACK_CELL, STACK_LABEL)}>
              <Badge variant="outline">{sourceLabel(c)}</Badge>
            </TableCell>
            <TableCell data-label="Nereden" className={cn("whitespace-normal text-muted-foreground", STACK_CELL, STACK_LABEL)}>
              <ViaCell candidate={c} />
            </TableCell>
            <TableCell data-label="Takipçi" className={cn("text-right", STACK_CELL, STACK_LABEL)}>
              <MeasuredValue
                value={c.followers}
                format={formatCompact}
                reason="Takipçi sayısı henüz toplanmadı ya da platform vermedi."
              />
            </TableCell>
            <TableCell data-label="Boy" className={cn(STACK_CELL, STACK_LABEL)}>
              <SizeCell similarSize={c.similarSize} />
            </TableCell>
            <TableCell data-label="Bulunma" className={cn("whitespace-nowrap text-muted-foreground", STACK_CELL, STACK_LABEL)}>
              {formatDate(c.discoveredAt, timeZone) ?? "—"}
            </TableCell>
            <TableCell className={cn(STACK_CELL, STACK_FULL)}>
              <CompetitorStatusActions competitorId={c.competitorId} handle={c.handle} allow={["tracked", "ignored"]} restoreTo="candidate" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
