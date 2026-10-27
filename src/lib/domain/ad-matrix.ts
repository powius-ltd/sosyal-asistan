/** Kreatif Matris'in reklam tarafı tipleri (hücre işareti, kreatif girdisi, hücre istatistiği). `domain/ads.ts` yeniden dışa aktarır (boyut sınırı için ayrıldı). */
import type { AdMoney, AdSignal } from "@/lib/domain/ads";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";

/**
 * Hücre işareti kuralının imzası. Saf uygulaması `lib/matrix`'tedir (`adCellSignalOf`; hesap türüne ve platforma bakmaz):
 * `worked > 0` → worked · `fatigued > 0` → fatigued · `weak > 0` → weak · `creatives > 0` → unmeasured · aksi → untested.
 */
export type AdCellSignalRule = (ads: Pick<AdCellStat, "creatives" | "worked" | "fatigued" | "weak">) => AdSignal;

/**
 * Tek kreatifin yargısı (reklam kararından türer, `lib/matrix/ad-source.ts`): `worked` tuttu · `fatigued` yoruldu · `weak` tutmadı ·
 * `unjudged` öğreniyor, yetersiz veri ya da hedef yok (hiçbir sayıma girmez).
 */
export const AD_OUTCOMES = ["worked", "fatigued", "weak", "unjudged"] as const;
export type AdOutcome = (typeof AD_OUTCOMES)[number];

/**
 * Bir reklam kreatifinin matrise GİRDİ olan özeti (depo doldurur, `lib/matrix` hücreye dağıtır). Hücre YALNIZ `sourceContentId`'nin
 * gösterdiği içeriğin doğrulanmış etiketinden çözülür (kopya yazılmaz); içerik bağı ya da etiketi yoksa kreatif ETİKETSİZDİR:
 * hücreye girmez, `AdMatrixSource.unlabeledAdCount`'a sayılır.
 */
export interface AdCreativeOutcome {
  /** Reklamın panel kimliği (`adRefOf` ile başvuruya çevrilir). */
  adId: string;
  /** Reklamın görünen adı. */
  name?: string;
  /** Kreatif kendi içeriğiyse o içerik. */
  sourceContentId?: string;
  outcome: AdOutcome;
  /** Kreatifin karar güveni. */
  confidence: ConfidenceLevel;
  /** Dönem harcaması; bilinmiyorsa yok. */
  spend?: AdMoney;
  /** Bir sonucun maliyeti, hesabın alışılmışının kaç katı (< 1 iyi). Sonuç ya da baz yoksa yok. */
  costVsBaseline?: number;
  /** Harcanan paraya dönen, hesabın alışılmışının kaç katı (> 1 iyi). Gelir ölçülmüyorsa yok. */
  returnVsBaseline?: number;
}

/** Matrisin reklam girdisi. Reklam hesabı YOKSA bu nesne de yoktur (`undefined`): hücrelerde `ads` alanı çıkmaz. */
export interface AdMatrixSource {
  creatives: AdCreativeOutcome[];
  /** Etiketsiz (hücresi çözülemeyen) dış reklam sayısı; `creatives` içindekilerden ayrı bilinenler. */
  unlabeledAdCount: number;
}

/** Hücrede gösterilen örnek reklam. */
export interface AdCellSample {
  /** `ad:<adId>`. */
  adRef: string;
  name?: string;
  outcome: AdOutcome;
  hookType?: string;
  /** Kreatifin kendi içeriği (bağlantı için). */
  sourceContentId?: string;
  /** Yalnız yönetici modunda gösterilir. */
  costVsBaseline?: number;
  returnVsBaseline?: number;
}

/** Matris hücresinin reklam tarafı. `worked + fatigued + weak = judged ≤ creatives`. */
export interface AdCellStat {
  /** Hücreye düşen reklam kreatifi sayısı. */
  creatives: number;
  /** Yargılanan (`unjudged` olmayan) kreatif sayısı. */
  judged: number;
  worked: number;
  fatigued: number;
  weak: number;
  /** Yargılanmış kreatif sayısı (`cellMinJudgedForConfidence` altı düşük) ve kreatif güvenlerinin ZAYIFI. */
  confidence: ConfidenceLevel;
  /** Hücredeki kreatiflerin toplam harcaması; bilinmiyorsa ya da para birimleri karışıksa yok. Yalnız yönetici. */
  spend?: AdMoney;
  /** Yargılanan kreatiflerin sonuç maliyeti oranlarının medyanı (alışılmışın kaç katı); ölçülen yoksa yok. Yalnız yönetici. */
  costVsBaseline?: number;
  /** Aynı kural, getiri için. Yalnız yönetici. */
  returnVsBaseline?: number;
  /** Örnek reklamlar: tutan → yorulan → tutmayan → yargılanmayan, eşitlikte `adRef`; en çok `AD_CELL_SAMPLES_MAX`. */
  samples: AdCellSample[];
}

/** Reklam hesabı var, hücrede kreatif yok (`untested`). Oranlar ve harcama `undefined` (0 değil). */
export function emptyAdCellStat(): AdCellStat {
  return { creatives: 0, judged: 0, worked: 0, fatigued: 0, weak: 0, confidence: "low", samples: [] };
}
