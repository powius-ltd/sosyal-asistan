/**
 * Reklam raporlarından matrisin reklam girdisi (`AdMatrixSource`) ve içerik başına reklam kullanımı (`AdUsage`): mock ve Supabase AYNI
 * fonksiyonları çağırır, depo yalnız ham satırları (`AdDataset`) toplar. Saf; LLM yok, saat `now`. Yargı `ads/learning.ts` `adOutcomeOf`
 * eşlemesidir (tuttu / yoruldu / tutmadı); `learning`, `insufficient_data`, `hold` (alışılmışından iyi değilse) ve `undecided`
 * YARGILANMAMIŞtır: hiçbir sayıma girmez. Organik ve reklam ölçüleri birleştirilmez; burada yalnız reklam tarafı kurulur.
 */
import { adCellStateOf, adOutcomeOf } from "@/lib/ads/learning";
import { adPeriodOf, buildAdReport, type AdDataset } from "@/lib/data/views/ads";
import { adRefOf, type AdCreativeOutcome, type AdMatrixSource, type AdOutcome, type AdResult, type AdUsage } from "@/lib/domain/ads";

/** Reklamın kreatif yargısı; yargılanamıyorsa `unjudged`. */
export const adCreativeOutcomeOf = (result: AdResult): AdOutcome => adOutcomeOf(result.verdict, result.vsBaseline) ?? "unjudged";

/** Her hesabın dönem raporundaki reklamlar (para birimi hesabın kendisindedir). */
function resultsOf(data: AdDataset, now: Date, days?: number): { result: AdResult; currency: string }[] {
  const period = adPeriodOf(now, days);
  return data.accounts.flatMap((account) => buildAdReport(data, account, period).ads.map((result) => ({ result, currency: account.currency })));
}

/**
 * Matrisin reklam girdisi. Reklam hesabı yoksa `undefined` (hücrelerde `ads` çıkmaz). Kendi içeriğine bağlı olmayan reklamlar listeye
 * girmez, `unlabeledAdCount`'a sayılır; içeriğe bağlı ama etiketsiz olanı matris kurulurken ayırır.
 */
export function buildAdMatrixSource(data: AdDataset, now: Date, days?: number): AdMatrixSource | undefined {
  if (data.accounts.length === 0) return undefined;
  const creatives: AdCreativeOutcome[] = [];
  let unlabeledAdCount = 0;
  for (const { result, currency } of resultsOf(data, now, days)) {
    const sourceContentId = result.creative?.sourceContentId;
    if (sourceContentId === undefined) {
      unlabeledAdCount += 1;
      continue;
    }
    creatives.push({
      adId: result.ad.id,
      name: result.ad.name,
      sourceContentId,
      outcome: adCreativeOutcomeOf(result),
      confidence: result.verdict.confidence,
      ...(result.sums.spend > 0 ? { spend: { amount: result.sums.spend, currency } } : {}),
      ...(result.vsBaseline.costPerResult === undefined ? {} : { costVsBaseline: result.vsBaseline.costPerResult }),
      ...(result.vsBaseline.returnOnSpend === undefined ? {} : { returnVsBaseline: result.vsBaseline.returnOnSpend }),
    });
  }
  return { creatives, unlabeledAdCount };
}

/**
 * İçeriklerin reklam kullanımı: satır yalnız içerik en az bir kreatife bağlıysa vardır ("denenmedi" yokluktan okunur). İşaret bağlı
 * reklamların kararlarından türer (`adCellStateOf`: tuttu > yoruldu > tutmadı > ölçülmedi).
 */
export function buildAdUsageFromReports(data: AdDataset, contentIds: readonly string[], now: Date): AdUsage[] {
  const wanted = new Set(contentIds);
  const linked = resultsOf(data, now)
    .map(({ result }) => result)
    .filter((result) => result.creative?.sourceContentId !== undefined && wanted.has(result.creative.sourceContentId));
  const byContent = Map.groupBy(linked, (result) => result.creative?.sourceContentId as string);
  return [...byContent]
    .map(([contentItemId, results]): AdUsage => {
      const state = adCellStateOf(results);
      return {
        contentItemId,
        creativeCount: new Set(results.map((result) => result.creative?.id)).size,
        signal: state.signal === "untested" ? "unmeasured" : state.signal,
        confidence: state.confidence,
        adRefs: results.map((result) => adRefOf(result.ad.id)).sort(),
      };
    })
    .sort((a, b) => a.contentItemId.localeCompare(b.contentItemId));
}
