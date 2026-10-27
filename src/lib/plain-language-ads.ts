/**
 * Düz dil sözlüğünün reklam parçası: `plain-language.ts` buradan dışa aktarır (ekran `@/lib/plain-language`'ten alır; ayrı dosya yalnız
 * boyut sınırı içindir). Kurallar aynı: jargon yok (`PANEL_JARGON`), ölçülemeyen için cümle kurulmaz, hesap / marka adı gömülmez.
 * Reklam hesabı ve para yalnız yönetici modunda gösterilir; tuttu / yoruldu / denenmedi işareti herkese.
 */
import type { AdReasonCode } from "@/lib/ads/verdict";
import type { AdSignal, AdVerdict, AdVerdictStatus } from "@/lib/domain/ads";
import type { LearningKind } from "@/lib/ads/learning";
import { formatNumber } from "@/lib/format";
import { liftTimes, roundedLift } from "@/lib/plain-language-lift";

/**
 * Reklam işareti (`AdSignal`): `badge` rozet metni (herkese görünür), `meaning` ipucu cümlesi. Tutar, sonuç maliyeti ve reklam jargonu
 * (ROAS, CPA, CTR…) taşımaz. Organik durum rozetinin YANINDA durur, onun yerine geçmez.
 */
export const AD_SIGNAL_PLAIN: Record<AdSignal, { badge: string; meaning: string }> = {
  worked: { badge: "Reklamda tuttu", meaning: "Bu yaklaşımla çıkan en az bir reklam işe yaradı." },
  fatigued: { badge: "Reklamda yoruldu", meaning: "Bu yaklaşımla çıkan reklam aynı kişilere çok gösterildi; yeni bir açılış gerekiyor." },
  weak: { badge: "Reklamda tutmadı", meaning: "Bu yaklaşımla çıkan reklamlar beklenen sonucu vermedi." },
  unmeasured: { badge: "Reklamda sonuç bekleniyor", meaning: "Reklam çıktı ama karar verecek kadar veri henüz yok." },
  untested: { badge: "Reklamda denenmedi", meaning: "Bu yaklaşımla henüz reklam çıkmadı." },
};

/** Reklam kararının (`AdVerdictStatus`) ekrandaki adı ve önerisi (yalnız yönetici; öneri uygulanmaz, panel reklam hesabına yazmaz). */
export const AD_VERDICT_PLAIN: Record<AdVerdictStatus, { label: string; advice: string }> = {
  scale: { label: "Artır", advice: "Hedefin üstünde gidiyor; bütçeyi artırmayı düşün." },
  hold: { label: "Bekle", advice: "Olduğu gibi bırak; değiştirmek için bir neden yok." },
  reduce: { label: "Azalt", advice: "Hedefin altında kaldı; bütçeyi azaltmayı düşün." },
  stop: { label: "Kapat", advice: "Harcanan paranın karşılığı gelmiyor; kapatmayı düşün." },
  fatigued: { label: "Yoruldu", advice: "Aynı kişilere çok gösterildi; yeni bir açılışla yenile." },
  learning: { label: "Öğreniyor", advice: "Reklam hâlâ öğrenme aşamasında; karar için bekle." },
  insufficient_data: { label: "Veri az", advice: "Karar verecek kadar veri yok." },
  undecided: { label: "Karar yok", advice: "Karar için önce bir hedef girilmeli." },
};

/**
 * Karar sebebi (`AdVerdict.reasons` kodları): her kod tek düz cümle; sayı gömülmez (rakamı ekran ayrıca gösterir), jargon yok.
 * Kod listesi `AD_REASON_CODES` ile birebir (`Record` eksik kodu derlemede yakalar).
 */
export const AD_REASON_PLAIN: Record<AdReasonCode, string> = {
  goal_missing: "Bu hesap için hedef girilmemiş; hedef olmadan karar verilemez.",
  goal_incomplete: "Hedef eksik girilmiş; tamamlanınca karar verilir.",
  no_spend: "Bu dönemde harcama yok.",
  key_unmeasured: "Karara yetecek sonuç bilgisi ölçülemedi.",
  learning_days: "Reklam yeni yayına girdi; öğrenme süresi dolmadı.",
  learning_results: "Henüz yeterli sonuç toplanmadı.",
  stop_below_break_even: "Harcanan paranın karşılığı, zarar etmeme sınırının altında kaldı.",
  stop_cost_far_above_target: "Bir sonuç, hedeflenen maliyetin çok üstüne mal oluyor.",
  stop_gate_few_results: "Kapatmak için henüz erken: sonuç az, harcama küçük.",
  reduce_below_target: "Getiri hedefin belirgin biçimde altında.",
  reduce_cost_above_target: "Bir sonuç hedeflenenden pahalıya geliyor.",
  fatigued_frequency_and_drop: "Aynı kişilere çok gösterildi ve tıklanma düştü.",
  scale_above_target: "Getiri hedefin üstünde ve istikrarlı.",
  scale_cost_below_target: "Bir sonuç hedeflenenden ucuza geliyor ve istikrarlı.",
  landing_page_suspect: "Çok tıklanıyor ama sonuç çıkmıyor; sorun reklamda değil, açılan sayfada olabilir.",
  recent_worsening: "Son günlerde bir sonucun maliyeti belirgin biçimde arttı.",
  unstable: "Sonuç maliyeti günden güne çok oynuyor; artırmadan önce oturmasını bekle.",
  stability_unmeasured: "İstikrar ölçülemedi; artırmak için daha fazla gün gerekli.",
  on_target: "Hedefe yakın gidiyor; değiştirmek için bir neden yok.",
};

/** Ölçülemeyen girdinin adı ve sebebi (`AdVerdict.unmeasured` kodları: "ölçü:sebep" ya da düz ölçü adı). */
const AD_MEASURE_PLAIN: Record<string, string> = { fatigue: "Yorgunluk", stability: "İstikrar", worsening: "Ani kötüleşme" };
const AD_MEASURE_WHY_PLAIN: Record<string, string> = {
  few_days: "yeterli gün yok",
  few_spend_days: "harcamalı gün az",
  frequency_unmeasured: "kaç kez gösterildiği ölçülmemiş",
  clicks_unmeasured: "tıklama ölçülmemiş",
  results_unmeasured: "sonuç ölçülmemiş",
};
const AD_UNMEASURED_WHOLE_PLAIN: Record<string, string> = {
  results: "Sonuç sayısı ölçülmediği için öğrenme durumu ve sonuç maliyeti hesaplanamadı.",
  returnOnSpend: "Sonucun parasal değeri ölçülmediği için getiri hesaplanamadı.",
  costPerResult: "Sonuç sayısı ölçülmediği için bir sonucun maliyeti hesaplanamadı.",
};

/** Ölçülemeyen girdi cümlesi ("Ani kötüleşme ölçülemedi: yeterli gün yok."); bilinmeyen kod → undefined (uydurma cümle yok). */
export function adUnmeasuredPhrase(code: string): string | undefined {
  const whole = AD_UNMEASURED_WHOLE_PLAIN[code];
  if (whole !== undefined) return whole;
  const [measure, why] = code.split(":");
  const name = AD_MEASURE_PLAIN[measure ?? ""];
  const reason = AD_MEASURE_WHY_PLAIN[why ?? ""];
  return name === undefined || reason === undefined ? undefined : `${name} ölçülemedi: ${reason}.`;
}

/** Kararın sebep cümleleri sırasıyla (bilinmeyen kod atlanır). */
export const adReasonPhrases = (verdict: Pick<AdVerdict, "reasons">): string[] =>
  verdict.reasons.flatMap((code) => (code in AD_REASON_PLAIN ? [AD_REASON_PLAIN[code as AdReasonCode]] : []));

/** Öğrenme işaretinin (`LearningKind`) rozeti ve cümlesi; matris tarafı (R4) ve kartlar bundan okur. */
export const AD_LEARNING_PLAIN: Record<LearningKind, { badge: string; meaning: string }> = {
  ad_candidate: { badge: "Reklama uygun", meaning: "Bu video kendi hesabında çok tuttu ve henüz reklamda kullanılmadı." },
  try_in_ads: { badge: "Reklamda dene", meaning: "Rakiplerde işe yarayan bu yaklaşımı henüz reklamda denemedin." },
  try_organic: { badge: "Videoda dene", meaning: "Bu yaklaşım reklamda tuttu; kendi hesabında henüz denemedin." },
  refresh_opening: { badge: "Yeni açılış dene", meaning: "Bu reklam yoruldu; aynı yaklaşımı yeni bir açılışla yenile." },
};

/**
 * Organik içeriğin reklam işareti (Tutanlar kartı, açılış kütüphanesi satırı; yalnız yönetici): kendi videon reklama uygun mu, reklamda ne oldu.
 * Ölçü ya da para yazmaz; organik ve reklam sonucu ayrı söylenir.
 */
export const AD_ORGANIC_PLAIN = {
  candidate: { badge: "Reklama uygun", meaning: AD_LEARNING_PLAIN.ad_candidate.meaning },
  used: {
    worked: { badge: "Reklamda da tuttu", meaning: "Bu videoyla çıkan reklam da işe yaradı." },
    fatigued: { badge: "Reklamda yoruldu", meaning: "Bu videoyla çıkan reklam aynı kişilere çok gösterildi; yeni bir açılış gerekiyor." },
    weak: { badge: "Reklamda tutmadı", meaning: "Bu videoyla çıkan reklam beklenen sonucu vermedi." },
    unmeasured: { badge: "Reklamda henüz erken", meaning: "Bu videoyla reklam çıktı ama karar verecek kadar veri henüz yok." },
  },
  filter: { label: "Reklam", all: "Hepsi", used: "Reklamda denenmiş" },
} as const;

/** Az veriye dayanan işaretin notu: kural değil işaret. */
export const AD_WEAK_MARK_PLAIN = "Az veriye dayanıyor: kesin değil, yalnız bir işaret.";

/** Reklam hesabı bağlı değilken boş ekran. */
export const AD_EMPTY_PLAIN = {
  title: "Reklam hesabı bağlı değil",
  body: "Reklam hesabı bağlanınca harcama, sonuç ve neyin tuttuğu burada görünür. Panel reklam hesabına yazmaz; yalnız okur ve öneri verir.",
} as const;

/** Sekme / sayfa adı. */
export const AD_PAGE_TITLE_PLAIN = "Reklamlar";

/** Hücredeki reklam bölümünün sabit metinleri. */
export const AD_CELL_PLAIN = {
  side: "Reklam",
  samplesTitle: "Bu yaklaşımla çıkan reklamlar",
  lowConfidence: "az reklam: kural değil işaret",
  unnamed: "adsız reklam",
} as const;

/** "3 reklam" (0 için cümle kurulmaz: `untested` rozeti söyler). */
export const adCountPhrase = (count: number): string | undefined => (count > 0 ? `${formatNumber(count)} reklam` : undefined);

/** Hangi yaklaşıma girdiği bilinmeyen (etiketsiz) reklamlar; yoksa cümle yok. */
export const adUnlabeledPhrase = (count: number): string | undefined =>
  count > 0 ? `${formatNumber(count)} reklamın hangi yaklaşıma girdiği bilinmiyor; burada sayılmadı.` : undefined;

/** Sonuç maliyeti oranı (yalnız yönetici): "bir sonuç alışılmışın 0,7 katına mal oldu". Ölçülemeyen → undefined. */
export function adCostPhrase(ratio: number | undefined): string | undefined {
  const times = liftTimes(ratio);
  if (times === undefined) return undefined;
  return roundedLift(ratio) === 1 ? "bir sonuç alışılmış maliyetle geldi" : `bir sonuç alışılmışın ${times}na mal oldu`;
}

/** Getiri oranı (yalnız yönetici): "harcanan para alışılmışın 1,4 katı geri döndü". Ölçülemeyen → undefined. */
export function adReturnPhrase(ratio: number | undefined): string | undefined {
  const times = liftTimes(ratio);
  if (times === undefined) return undefined;
  return roundedLift(ratio) === 1 ? "harcanan para alışılmış düzeyde geri döndü" : `harcanan para alışılmışın ${times} geri döndü`;
}
