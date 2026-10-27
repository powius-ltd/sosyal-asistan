import { MeasuredValue } from "@/components/common/measured-value";
import { StatCard } from "@/components/common/stat-card";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import type { AdReport } from "@/lib/domain/ads";
import { formatMoney, formatNumber } from "@/lib/format";

const COPY = AD_SCREEN_COPY.strip;

/**
 * Üst şerit: harcanan, alınan sonuç, bir sonucun maliyeti, (varsa) getiri. Para hesabın KENDİ para biriminde; ölçülemeyen değer tire +
 * sebep (0 değil). Harcama 0 ise "0 ₺" yazılır (gerçek ölçüm).
 */
export function SummaryStrip({ report }: { report: AdReport }) {
  const { sums, metrics } = report.totals;
  const { currency, goal } = report.account;
  return (
    <section aria-label="Özet" data-slot="ad-summary" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label={COPY.spend} value={<MeasuredValue value={sums.spend} format={(value) => formatMoney(value, currency)} />} />
      <StatCard label={COPY.results(goal?.resultLabel)} value={<MeasuredValue value={sums.results} reason={COPY.resultsReason} inline format={(value) => formatNumber(value)} />} />
      <StatCard
        label={COPY.costPerResult}
        value={<MeasuredValue value={metrics.costPerResult} reason={COPY.costReason} inline format={(value) => formatMoney(value, currency)} />}
      />
      <StatCard
        label={COPY.returnOnSpend}
        value={<MeasuredValue value={metrics.returnOnSpend} reason={COPY.returnReason} inline format={(value) => formatMoney(value, currency)} />}
      />
    </section>
  );
}
