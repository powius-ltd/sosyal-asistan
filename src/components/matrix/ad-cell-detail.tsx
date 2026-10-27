import Link from "next/link";

import { ContentLink } from "@/components/common/content-link";
import { LiftBadge } from "@/components/common/lift-badge";
import { MeasuredValue } from "@/components/common/measured-value";
import { AdSignalBadge, signalOfOutcome } from "@/components/matrix/ad-signal-badge";
import { AD_REF_PREFIX, type AdCellSample, type AdCellStat, type AdMoney } from "@/lib/domain/ads";
import type { CreativeMatrixCell } from "@/lib/domain/creative-matrix";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import { formatMoney, formatNumber } from "@/lib/format";
import { adCellSignalOf } from "@/lib/matrix/ad-signal";
import { AD_CELL_PLAIN, adCostPhrase, adCountPhrase, adReturnPhrase } from "@/lib/plain-language-ads";
import { ROUTES } from "@/lib/routes";

/** Para / sonuç maliyeti / getiri cümlesi; ölçülemeyen parça yazılmaz. */
function moneyLine(parts: { spend?: AdMoney; cost?: number; ret?: number }): string | undefined {
  const spend = parts.spend === undefined ? undefined : `harcama ${formatMoney(parts.spend.amount, parts.spend.currency)}`;
  const items = [spend, adCostPhrase(parts.cost), adReturnPhrase(parts.ret)].filter((part): part is string => part !== undefined);
  return items.length === 0 ? undefined : items.join(" · ");
}

const SOURCE_BOX = "flex flex-col gap-0.5 rounded-lg border bg-background/80 px-3 py-2";

/** Üç kaynağın yan yana özeti: rakip · sen · reklam. Her kaynak kendi ölçüsünü ve güvenini söyler; ortak puan yok. */
function ThreeSources({ cell, ads }: { cell: CreativeMatrixCell; ads: AdCellStat }) {
  const count = adCountPhrase(ads.creatives);
  return (
    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3" data-testid="matrix-three-sources">
      <div className={SOURCE_BOX}>
        <dt className="text-xs text-muted-foreground">Rakip</dt>
        <dd className="flex flex-wrap items-center gap-1.5">
          <span className="tabular">{formatNumber(cell.rivals.n)} video</span>
          {cell.rivals.n > 0 ? <LiftBadge lift={cell.rivals.medianLift} /> : null}
        </dd>
      </div>
      <div className={SOURCE_BOX}>
        <dt className="text-xs text-muted-foreground">Sen</dt>
        <dd className="flex flex-wrap items-center gap-1.5">
          {cell.own.n > 0 ? (
            <>
              <span className="tabular">{formatNumber(cell.own.n)} video</span>
              <LiftBadge lift={cell.own.medianLift} />
            </>
          ) : (
            <span>denemedin</span>
          )}
        </dd>
      </div>
      <div className={SOURCE_BOX}>
        <dt className="text-xs text-muted-foreground">{AD_CELL_PLAIN.side}</dt>
        <dd className="flex flex-wrap items-center gap-1.5">
          <AdSignalBadge signal={adCellSignalOf(ads)} />
          {count !== undefined ? <span className="tabular">{count}</span> : null}
          {ads.creatives > 0 && ads.confidence === "low" ? <span className="text-xs text-muted-foreground">{AD_CELL_PLAIN.lowConfidence}</span> : null}
        </dd>
      </div>
    </dl>
  );
}

function AdSampleRow({ sample }: { sample: AdCellSample }) {
  const adId = sample.adRef.startsWith(AD_REF_PREFIX) ? sample.adRef.slice(AD_REF_PREFIX.length) : sample.adRef;
  const money = moneyLine({ cost: sample.costVsBaseline, ret: sample.returnVsBaseline });
  return (
    <li className="flex flex-col gap-1 px-3 py-2 text-sm" data-ad-ref={sample.adRef}>
      <span className="flex flex-wrap items-center gap-2">
        <Link href={ROUTES.ad(adId)} className="min-w-0 font-medium hover:underline max-md:min-h-tap max-md:items-center">
          {sample.name ?? AD_CELL_PLAIN.unnamed}
        </Link>
        <AdSignalBadge signal={signalOfOutcome(sample.outcome)} />
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {sample.hookType !== undefined ? <span>Açılış: {hookTypeLabel(sample.hookType)}</span> : null}
        {sample.sourceContentId !== undefined ? <ContentLink id={sample.sourceContentId}>kendi videosu</ContentLink> : null}
        {money !== undefined ? <span data-testid="ad-sample-money">{money}</span> : null}
      </span>
    </li>
  );
}

/**
 * Hücre ayrıntısının reklam bölümü (YALNIZ yönetici modunda çizilir; çağıran kapıyı tutar): üç kaynağın yan yana özeti + bu yaklaşımla çıkan
 * örnek reklamlar (`/reklamlar/[id]` bağlantılı). `cell.ads` yoksa (reklam hesabı yok) hiçbir şey çizilmez.
 */
export function AdCellDetail({ cell }: { cell: CreativeMatrixCell }) {
  const ads = cell.ads;
  if (ads === undefined) return null;
  const summary = moneyLine({ spend: ads.spend, cost: ads.costVsBaseline, ret: ads.returnVsBaseline });
  return (
    <div className="flex flex-col gap-3" data-testid="matrix-ad-detail">
      <ThreeSources cell={cell} ads={ads} />
      {ads.samples.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">{AD_CELL_PLAIN.samplesTitle}</h4>
          <ul className="flex flex-col divide-y rounded-lg border bg-background/80">
            {ads.samples.map((sample) => (
              <AdSampleRow key={sample.adRef} sample={sample} />
            ))}
          </ul>
          <p className="text-xs text-muted-foreground" data-testid="ad-operator-summary">
            {summary ?? <MeasuredValue value={undefined} reason="Reklam maliyeti ölçülemedi" inline />}
          </p>
        </div>
      ) : null}
    </div>
  );
}
