/**
 * "Kaçın" bölümü (kod): (1) ≥ 2 ölçülmüş videolu ve baz çizgisinin ALTINDA (medyan lift < 1) kalan en düşük gruplar (rakip
 * verisi; en çok 3) — "kaçın"a giren grup yön olamaz (yönler etki > 1 ister); (2) niş dışı HESAP: konu eleğinden geçen videoların
 * en az 3'ü ve ≥ %60'ı niş dışı ise hesap sahibine göre özetlenir. Daha azına (ör. tek video) dayanıp hesabı ilan etmek yanıltır:
 * o durumda yalnız video düzeyinde kalır (video öğrenmeye girmez, hesap "kaçın"a yazılmaz). Gerekçe metni kısa kod metnidir;
 * LLM metni sonradan yazar.
 */
import type { AvoidEntry, AvoidSection } from "@/lib/domain/weekly-plan";
import { confidenceForSample } from "@/lib/domain/weekly-plan";
import { formatPercent } from "@/lib/format";
import { AVOID_LOW_LIFT_MAX, AVOID_OFF_NICHE_MAX, AVOID_OFF_NICHE_MIN_SCREENED, AVOID_OFF_NICHE_MIN_SHARE } from "@/lib/insights/constants";
import { groupTitle, isWeakGroup, type ScoredGroup } from "@/lib/insights/groups";
import { groupByOwner, type Pool } from "@/lib/insights/pool";
import { summarizeLifts } from "@/lib/metrics/hook-lift";
import { REASON_PLAIN } from "@/lib/plain-language-plan";

function lowLiftEntries(groups: readonly ScoredGroup[]): AvoidEntry[] {
  return groups
    .filter(isWeakGroup)
    .sort((a, b) => (a.impact ?? 0) - (b.impact ?? 0) || b.liftN - a.liftN || a.value.localeCompare(b.value))
    .slice(0, AVOID_LOW_LIFT_MAX)
    .map((g): AvoidEntry => ({
      kind: "low_lift",
      group: g.group,
      value: g.value,
      label: g.label,
      medianLift: g.impact,
      sampleSize: g.liftN,
      confidence: g.confidence,
      reason: REASON_PLAIN.avoidLow(groupTitle(g), g.basis === "own", { sampleSize: g.liftN, impact: g.impact, outliers: g.outlierCount }),
    }));
}

function offNicheEntries(pool: Pool): AvoidEntry[] {
  // Payda (elenen video sayısı) bilinmiyorsa hesap kararı verilmez: yalnız video düzeyinde dışlama kalır.
  const screenedIds = pool.screenedIds;
  if (screenedIds === undefined) return [];
  const offIds = new Set(pool.offNiche.map((pi) => pi.item.id));
  const screenedByOwner = groupByOwner([...pool.allOwn, ...pool.allRivals].filter((pi) => screenedIds.has(pi.item.id) || offIds.has(pi.item.id)));
  return [...groupByOwner(pool.offNiche)]
    .flatMap(([ownerId, items]) => {
      const screened = screenedByOwner.get(ownerId)?.length ?? items.length;
      return screened >= AVOID_OFF_NICHE_MIN_SCREENED && items.length / screened >= AVOID_OFF_NICHE_MIN_SHARE ? [{ items, screened }] : [];
    })
    .sort((a, b) => b.items.length - a.items.length || a.items[0].item.owner.handle.localeCompare(b.items[0].item.owner.handle))
    .slice(0, AVOID_OFF_NICHE_MAX)
    .map(({ items, screened }): AvoidEntry => {
      const handle = items[0].item.owner.handle;
      return {
        kind: "off_niche",
        group: "off_niche",
        value: handle,
        label: `@${handle}`,
        medianLift: summarizeLifts(items.map((pi) => pi.lift)).medianLift,
        sampleSize: items.length,
        confidence: confidenceForSample(items.length),
        reason: REASON_PLAIN.avoidOffNiche(handle, screened, items.length, formatPercent(items.length / screened, 0) ?? ""),
      };
    });
}

export function buildAvoid(groups: readonly ScoredGroup[], pool: Pool): AvoidSection {
  return { entries: [...lowLiftEntries(groups), ...offNicheEntries(pool)] };
}
