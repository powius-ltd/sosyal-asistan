import { AdRow } from "@/components/ads/ad-row";
import { groupAds } from "@/components/ads/ad-groups";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import type { AdReport } from "@/lib/domain/ads";

const COLS = AD_SCREEN_COPY.columns;

/** Reklamlar, öneriye göre gruplu: artır · azalt / kapat · yoruldu · bekle; altta "henüz erken" ve "karar verilemedi". */
export function AdsTable({ report }: { report: AdReport }) {
  const groups = groupAds(report.ads);
  if (groups.length === 0) return <p className="mb-6 text-sm text-muted-foreground">{AD_SCREEN_COPY.noAds}</p>;
  return (
    <div className="mb-6 space-y-6">
      {groups.map((group) => (
        <section key={group.key} data-slot={`ad-group-${group.key}`} aria-labelledby={`ad-group-${group.key}`}>
          <h2 id={`ad-group-${group.key}`} className="text-lg font-semibold">
            {group.title} <span className="text-sm font-normal text-muted-foreground">({group.ads.length})</span>
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">{group.hint}</p>
          <div className="rounded-xl border">
            <div className="hidden grid-cols-[minmax(0,2fr)_6rem_5rem_7rem_minmax(0,3fr)] gap-4 border-b px-4 py-2 text-xs text-muted-foreground md:grid" aria-hidden>
              <span>Reklam</span>
              <span>{COLS.spend}</span>
              <span>{COLS.results}</span>
              <span>{COLS.costPerResult}</span>
              <span>{COLS.reasons}</span>
            </div>
            <ul className="divide-y">
              {group.ads.map((ad) => (
                <AdRow key={ad.ad.id} ad={ad} currency={report.account.currency} />
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
