import { MeasuredValue } from "@/components/common/measured-value";
import { PlatformBadge } from "@/components/common/platform-badge";
import { CompetitorStatusBadge } from "@/components/competitors/competitor-status-badge";
import { contentCountCell } from "@/components/competitors/content-count";
import { formatFrequency } from "@/components/competitors/format-frequency";
import { STACK_CELL, STACK_FULL, STACK_LABEL, STACK_ROW, STACK_TABLE } from "@/components/competitors/stack-table";
import { statusReasonText } from "@/components/competitors/status-reason";
import { CompetitorStatusActions } from "@/components/competitors/status-actions";
import { changeBetween } from "@/components/overview/trend-math";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Competitor, CompetitorStatus } from "@/lib/domain/competitor";
import { formatCompact, formatDate, formatDateTime } from "@/lib/format";

type Target = "tracked" | "ignored";

/** Yoksayınca / izleyince "Geri al"ın döneceği durum: yalnız izlenen ve aday geri alınabilir (gizli / bulunamadı kullanıcıca atanamaz). */
const RESTORE_TO: Partial<Record<CompetitorStatus, "tracked" | "candidate" | "ignored">> = { tracked: "tracked", candidate: "candidate", ignored: "ignored" };

/** Durumuna göre hangi satır aksiyonları sunulur. `private`/`not_found` izlenemez, yalnız yoksayılabilir. */
const ROW_ACTIONS: Record<CompetitorStatus, readonly Target[]> = {
  tracked: ["ignored"],
  candidate: ["tracked", "ignored"],
  ignored: ["tracked"],
  private: ["ignored"],
  not_found: ["ignored"],
};

/** Ölçülemeyen hücrenin sebebi (tire üzerindeki ipucu). */
function missingReason(c: Competitor, what: string): string {
  if (c.status === "private") return `Hesap gizli; ${what} alınamadı.`;
  if (c.status === "not_found") return `Hesap bulunamadı; ${what} alınamadı.`;
  if (c.lastCollectedAt === undefined) return `Henüz toplanmadı; ${what} yok.`;
  return `Platform ${what} vermedi.`;
}

interface CompetitorsTableProps {
  /** Özet istatistikler (`medianViews`, `outlierCount`, `postsPerWeek`, `followersDelta7d`) rakip kaydında gelir. */
  competitors: Competitor[];
  timeZone?: string;
}

/** Takipçinin 7 günlük değişimi ("+320 (+%1,2)"); ölçülemediyse sebebiyle. */
function followersChange(c: Competitor) {
  const base = c.followers !== undefined && c.followersDelta7d !== undefined ? c.followers - c.followersDelta7d : undefined;
  return changeBetween(c.followers, base, "7 gün önceki takipçi ölçümü yok; değişim hesaplanamadı.");
}

/** Sayısal sütun başlığı: dar ekranda iki satıra sarılır (değerler sarılmaz, başlık sarılır). */
const NUM_HEAD = "text-right whitespace-normal leading-tight";

/**
 * Rakipler tablosu. 1440 px'te yatay kaydırma çıkmasın diye: platform sütunu hesap hücresine katıldı, durum sebebi
 * durum hücresinde (sarılır), son toplama yalnız tarih (saat ipucunda), başlıklar sarılır. Yatay kaydırma kabı
 * (`Table`) dar ekranlar için yine de durur.
 */
export function CompetitorsTable({ competitors, timeZone }: CompetitorsTableProps) {
  return (
    <Table className={STACK_TABLE}>
      <TableHeader>
        <TableRow>
          <TableHead>Hesap</TableHead>
          <TableHead className={NUM_HEAD}>Takipçi</TableHead>
          <TableHead className={NUM_HEAD}>İçerik</TableHead>
          <TableHead className={NUM_HEAD}>Paylaşım sıklığı</TableHead>
          <TableHead className={NUM_HEAD} title="Rakibin kısa videolarının tipik izlenmesi">
            Tipik izlenme
          </TableHead>
          <TableHead className={NUM_HEAD}>Tutan içerik</TableHead>
          <TableHead>Durum</TableHead>
          <TableHead className="whitespace-normal leading-tight">Son toplama</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Eylemler</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {competitors.map((c) => {
          const content = contentCountCell(c);
          const reason = statusReasonText(c);
          return (
            <TableRow key={c.id} data-competitor={c.handle} className={STACK_ROW}>
              <TableCell className={cn("max-w-60", STACK_CELL, STACK_FULL, "max-md:max-w-none")}>
                <div className="flex items-center gap-2.5">
                  {/* Rakip profil fotoğrafı (süreli CDN adresi) gösterilmez: Faz 2 kararı, rakip görseli yalnız resmi embed ile. */}
                  <Avatar size="default">
                    <AvatarFallback>{c.handle.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col items-start gap-0.5">
                    <span className="max-w-full truncate font-medium">@{c.handle}</span>
                    <span className="flex max-w-full items-center gap-1.5 text-xs text-muted-foreground">
                      <PlatformBadge platform={c.platform} />
                      {c.displayName ? <span className="truncate">{c.displayName}</span> : null}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell data-label="Takipçi" className={cn("text-right", STACK_CELL, STACK_LABEL)}>
                <MeasuredValue value={c.followers} format={formatCompact} reason={missingReason(c, "takipçi sayısı")} />
                <span className="block text-xs text-muted-foreground">
                  7 gün: <MeasuredValue measured={followersChange(c).text} />
                </span>
              </TableCell>
              <TableCell data-label="İçerik" className={cn("text-right", STACK_CELL, STACK_LABEL)}>
                <MeasuredValue measured={content} />
              </TableCell>
              <TableCell data-label="Paylaşım sıklığı" className={cn("text-right", STACK_CELL, STACK_LABEL)}>
                <MeasuredValue
                  value={formatFrequency(c.postsPerWeek)}
                  reason="Sıklık için toplanan içerikte en az 3 tarihli paylaşım gerekir."
                />
              </TableCell>
              <TableCell data-label="Tipik izlenme" className={cn("text-right", STACK_CELL, STACK_LABEL)}>
                <MeasuredValue value={c.medianViews} format={formatCompact} reason={missingReason(c, "izlenme")} />
              </TableCell>
              <TableCell data-label="Tutan içerik" className={cn("text-right", STACK_CELL, STACK_LABEL)}>
                <MeasuredValue
                  value={c.outlierCount}
                  reason="Lift hesaplanan içerik yok (baz çizgisi için yeterli geçmiş içerik gerekir)."
                />
              </TableCell>
              <TableCell data-label="Durum" className={cn("max-w-56 whitespace-normal", STACK_CELL, STACK_LABEL, "max-md:max-w-none")}>
                <div className="flex flex-col items-start gap-1">
                  <CompetitorStatusBadge status={c.status} />
                  {reason ? (
                    <span className="text-xs text-muted-foreground" data-testid="status-reason">
                      {reason}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell data-label="Son toplama" className={cn("text-muted-foreground", STACK_CELL, STACK_LABEL)} title={formatDateTime(c.lastCollectedAt, timeZone)}>
                <MeasuredValue
                  value={c.lastCollectedAt}
                  format={(iso) => formatDate(iso, timeZone)}
                  reason="Bu hesap için henüz veri toplanmadı."
                />
              </TableCell>
              <TableCell className={cn(STACK_CELL, STACK_FULL)}>
                <CompetitorStatusActions competitorId={c.id} handle={c.handle} allow={ROW_ACTIONS[c.status]} restoreTo={RESTORE_TO[c.status]} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
