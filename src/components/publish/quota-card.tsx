import { Gauge } from "lucide-react";

import { MeasuredValue } from "@/components/common/measured-value";
import type { QuotaRow } from "@/components/publish/quota";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatNumber } from "@/lib/format";
import { QUOTA_NOTE } from "@/lib/plain-language-publish";

/**
 * Yayın kotası: "Bugün x / limit yayın (24 saat)". Resmi API'ye bağlı hesap yoksa değer
 * ölçülemez ("bağlantı yok"): 0 gösterilmez.
 */
export function QuotaCard({ rows }: { rows: QuotaRow[] }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Yayın kotası (24 saat)</span>
          <Gauge className="size-4 text-muted-foreground" aria-hidden />
        </div>

        {rows.length === 0 ? (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight">
              <MeasuredValue
                value={undefined}
                reason="Bağlantı yok: kota, hesap resmi API ile bağlanınca okunur."
              />
            </span>
            <span className="text-sm text-muted-foreground">bağlantı yok</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.accountId} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-muted-foreground">@{row.handle}</span>
                  <span className="tabular">
                    <span className="text-lg font-semibold">{formatNumber(row.used)}</span>
                    <span className="text-muted-foreground"> / {formatNumber(row.limit)} yayın</span>
                  </span>
                </div>
                <Progress value={(row.used / row.limit) * 100} aria-label={`@${row.handle} 24 saatlik yayın kotası`} />
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">{QUOTA_NOTE}</p>
      </CardContent>
    </Card>
  );
}
