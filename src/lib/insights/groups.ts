/**
 * Yön/kaçın/aday için grup puanlaması: rakip videoları hook türü (analiz varsa), süre kovası, CTA türü ve konu kümesine göre
 * gruplanır; her grubun lift özeti rakip içeriklerinden, YENİLİK kendi hesabın o grubu deneyip denemediğinden gelir.
 *  - etki = grubun medyan lift'i (rakip, son `GROUP_WINDOW_DAYS` gün, yalnız ölçülmüş ve olgun lift; GÖSTERİLEN etki ham kalır).
 *    Sıralama puanı = büzülmüş etki × yenilik × geri besleme: büzme `shrinkImpact` (az örnekli uç değer baza çekilir),
 *    geri besleme geçen haftaların tuttu/tutmadı sonucudur (`feedback.ts`, 0,85–1,15; kayıt yoksa 1).
 *  - Yenilik: kendi hesap o grupta en az bir video paylaştıysa 1, hiç paylaşmadıysa 1,5. Kendi videolarının bir eksende HİÇBİRİ
 *    sınıflanamıyorsa (ör. kendi videolar analiz edilmedi → hook türü bilinmiyor) o eksen `comparable = false`: "denemedi"
 *    demek için kanıt yok, yenilik payı uydurulmaz. Kendi hesabın hiç videosu yoksa her eksen karşılaştırılabilir (hiçbirini denememiş).
 */
import { hookTypeLabel } from "@/lib/domain/hook-types";
import { CTA_TYPE_LABEL, DURATION_BUCKET_LABEL } from "@/lib/domain/taxonomy";
import { type ConfidenceLevel, type FocusGroup } from "@/lib/domain/weekly-plan";
import { GROUP_MIN_N, GROUP_WINDOW_DAYS, IMPACT_SHRINK_K, NOVELTY_UNTRIED } from "@/lib/insights/constants";
import type { DirectionFeedback, FeedbackIndex } from "@/lib/insights/feedback";
import type { PlanMode } from "@/lib/insights/mode";
import { withinDays, type Pool, type PoolItem } from "@/lib/insights/pool";
import { groupTitlePlain } from "@/lib/plain-language-plan";
import { summarizeLiftSamples } from "@/lib/metrics/hook-lift";

export interface GroupKey {
  group: FocusGroup;
  /** Taksonomi anahtarı (hook türü, süre kovası, CTA türü) ya da küme adı. */
  value: string;
  /** Ekranda görünen Türkçe ad. */
  label: string;
}

export const groupKeyId = (key: Pick<GroupKey, "group" | "value">): string => `${key.group}:${key.value}`;

/** Gruplama eksenlerinin sabit sırası (eşitlikte deterministik). */
export const GROUP_AXES: readonly FocusGroup[] = ["hook_type", "duration_bucket", "cta_type", "topic_cluster"];

export interface ScoredGroup extends GroupKey {
  /** Gruptaki rakip videoları (pencerede, niş içi); lift'i ölçülemeyenler dahil. */
  items: PoolItem[];
  /** Lift'i ölçülmüş (olgun) video sayısı: güven ve eşikler buna göre. */
  liftN: number;
  /** Etki: medyan lift; hiçbiri ölçülemediyse undefined. */
  impact?: number;
  outlierCount: number;
  confidence: ConfidenceLevel;
  ownTried: boolean;
  novelty: number;
  /** Geçen haftaların sonucu (n ≥ 1); yoksa undefined. Çarpan yalnız n ≥ 2'de 1'den farklıdır. */
  feedback?: DirectionFeedback;
  /** büzülmüş etki × yenilik × geri besleme çarpanı; etki yoksa undefined. */
  score?: number;
  /** Bu eksende kendi videolar sınıflanabiliyor mu (yenilik payı verilebilir mi). */
  comparable: boolean;
  /** Grubun dayandığı veri: `rivals` (rakip videoları) ya da `own` (rakipsiz mod: kendi videoların; yenilik çarpanı yok). */
  basis: PlanMode;
  /** "Tekrarla / seriye çevir" yönü (rakipsiz mod; gruplar değil, kendi tutanların kendisi): `repeat.ts`. */
  repeat?: boolean;
}

/** Bir videonun girdiği gruplar (hook türü, süre kovası, CTA türü ve kümeler); bilinmeyen eksende grup yok. */
export function groupKeysOf(pi: PoolItem): GroupKey[] {
  const keys: GroupKey[] = [];
  if (pi.hookType !== undefined) keys.push({ group: "hook_type", value: pi.hookType, label: hookTypeLabel(pi.hookType) });
  if (pi.bucket !== undefined) keys.push({ group: "duration_bucket", value: pi.bucket, label: DURATION_BUCKET_LABEL[pi.bucket] });
  if (pi.cta !== undefined) keys.push({ group: "cta_type", value: pi.cta, label: CTA_TYPE_LABEL[pi.cta] });
  for (const cluster of pi.clusters) keys.push({ group: "topic_cluster", value: cluster.label, label: cluster.label });
  return keys;
}

/** "Süre: 90 sn ve üstü" gibi ekran adı (gerekçe/kaçın metinleri). */
export const groupTitle = (key: GroupKey): string => groupTitlePlain(key.group, key.label);

/** Etkiyi örneğe göre baza (1) büzer: `1 + (etki − 1)·n/(n + K)`. Ölçülemeyen etki → undefined (0 değil). */
export function shrinkImpact(impact: number | undefined, n: number): number | undefined {
  return impact === undefined ? undefined : 1 + ((impact - 1) * n) / (n + IMPACT_SHRINK_K);
}

/**
 * Tüm grupları puanlar. Sıra: puan azalan (puansız sonda), örnek azalan, eksen sırası, değer.
 * `mode = "own"` (rakipsiz): gruplar KENDİ videolarından kurulur, aynı büzme + güven uygulanır ama yenilik çarpanı YOKTUR (1) ve her eksen
 * karşılaştırılabilirdir (kendi denediği şey).
 */
export function scoreGroups(pool: Pool, feedback?: FeedbackIndex, mode: PlanMode = "rivals"): ScoredGroup[] {
  const ownKeys = new Set<string>();
  const ownAxes = new Set<FocusGroup>();
  for (const pi of pool.own) {
    for (const key of groupKeysOf(pi)) {
      ownKeys.add(groupKeyId(key));
      ownAxes.add(key.group);
    }
  }
  const ownMode = mode === "own";
  const comparableAxis = (axis: FocusGroup) => ownMode || pool.own.length === 0 || ownAxes.has(axis);

  const buckets = new Map<string, { key: GroupKey; items: PoolItem[] }>();
  for (const pi of ownMode ? pool.own : pool.rivals) {
    if (!withinDays(pi, pool.nowMs, GROUP_WINDOW_DAYS)) continue;
    for (const key of groupKeysOf(pi)) {
      const id = groupKeyId(key);
      const bucket = buckets.get(id) ?? { key, items: [] };
      bucket.items.push(pi);
      buckets.set(id, bucket);
    }
  }

  return [...buckets.values()]
    .map(({ key, items }): ScoredGroup => {
      // Güven: örnek sayısı + baz çizgisi tavanı (ölçülmüş videoların ≥ %50'si düşük güvenli baz çizgisindeyse en çok orta).
      const summary = summarizeLiftSamples(items.map((pi) => ({ lift: pi.lift, lowBaseline: pi.lowBaseline })));
      const ownTried = ownKeys.has(groupKeyId(key));
      const novelty = ownMode || ownTried ? 1 : NOVELTY_UNTRIED;
      const groupFeedback = feedback?.get(groupKeyId(key));
      const shrunk = shrinkImpact(summary.medianLift, summary.n);
      const score = shrunk === undefined ? undefined : shrunk * novelty * (groupFeedback?.multiplier ?? 1);
      return { ...key, items, liftN: summary.n, impact: summary.medianLift, outlierCount: summary.outlierCount, confidence: summary.confidence, ownTried, novelty, feedback: groupFeedback, score, comparable: comparableAxis(key.group), basis: mode };
    })
    .sort(
      (a, b) =>
        (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY) ||
        b.liftN - a.liftN ||
        GROUP_AXES.indexOf(a.group) - GROUP_AXES.indexOf(b.group) ||
        a.value.localeCompare(b.value),
    );
}

/** Yön adayı mı: karşılaştırılabilir eksen, ≥ `GROUP_MIN_N` ölçülmüş video ve baz çizgisinin ÜSTÜNDE (etki > 1). */
export const isPromisingGroup = (g: ScoredGroup): boolean => g.comparable && g.liftN >= GROUP_MIN_N && g.impact !== undefined && g.impact > 1;

/** Kaçın adayı mı: ≥ `GROUP_MIN_N` ölçülmüş video ve baz çizgisinin ALTINDA (etki < 1). */
export const isWeakGroup = (g: ScoredGroup): boolean => g.liftN >= GROUP_MIN_N && g.impact !== undefined && g.impact < 1;

/** Kanıt sırası: lift azalan (ölçülemeyen sonda), sonra yayın anı yeni → eski, sonra kimlik (deterministik). */
export function byLiftDesc(a: PoolItem, b: PoolItem): number {
  return (b.lift ?? Number.NEGATIVE_INFINITY) - (a.lift ?? Number.NEGATIVE_INFINITY) || b.at - a.at || a.item.id.localeCompare(b.item.id);
}
