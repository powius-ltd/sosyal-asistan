import Link from "next/link";

import { VerdictBadge } from "@/components/ads/verdict-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import type { AdResult } from "@/lib/domain/ads";
import { formatMoney, formatNumber } from "@/lib/format";
import { adReasonPhrases } from "@/lib/plain-language-ads";
import { ROUTES } from "@/lib/routes";

const COLS = AD_SCREEN_COPY.columns;

/**
 * Bir reklamın satırı: `md`+ tek satır (ızgara), dar ekranda kart. Öneri adı + ilk neden cümlesi; ölçülemeyen değer tire + sebep.
 * Ayrıntı bağlantısı reklamın adıdır (dokunma hedefi satır boyunca).
 */
export function AdRow({ ad, currency }: { ad: AdResult; currency: string }) {
  const reason = adReasonPhrases(ad.verdict)[0];
  return (
    <li data-slot="ad-row" className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,2fr)_6rem_5rem_7rem_minmax(0,3fr)] md:items-center md:gap-4">
      <div className="min-w-0">
        <Link href={ROUTES.ad(ad.ad.id)} className="block min-h-tap truncate font-medium hover:underline md:min-h-0">
          {ad.ad.name}
        </Link>
        {ad.campaignName ? <span className="block truncate text-xs text-muted-foreground">{ad.campaignName}</span> : null}
        <span className="mt-1 inline-block md:hidden">
          <VerdictBadge status={ad.verdict.status} />
        </span>
      </div>
      <Metric label={COLS.spend}>
        <MeasuredValue value={ad.sums.spend} format={(value) => formatMoney(value, currency)} />
      </Metric>
      <Metric label={COLS.results}>
        <MeasuredValue value={ad.sums.results} reason="Sonuç ölçülmüyor." shortReason="ölçülmüyor" format={(value) => formatNumber(value)} />
      </Metric>
      <Metric label={COLS.costPerResult}>
        <MeasuredValue value={ad.metrics.costPerResult} reason="Sonuç ölçülmediği için hesaplanamadı." shortReason="hesaplanamadı" format={(value) => formatMoney(value, currency)} />
      </Metric>
      <div className="min-w-0 text-xs text-muted-foreground">
        <span className="mb-1 hidden md:inline-block">
          <VerdictBadge status={ad.verdict.status} />
        </span>
        {reason ? <p>{reason}</p> : null}
      </div>
    </li>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 md:block">
      <span className="text-xs text-muted-foreground md:sr-only">{label}</span>
      <span className="tabular">{children}</span>
    </div>
  );
}
