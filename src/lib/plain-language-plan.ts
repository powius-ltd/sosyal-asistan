// Dalga 2 · Plan
/**
 * Plan ekranlarının (Bu hafta, Fikirler, PDF rapor) MÜŞTERİYE görünen terimleri — düz dil sözlüğünün (`plain-language.ts`) plana ayrılmış
 * bölümü (`plain-language-onboarding.ts` ile aynı desen; ana dosya 400 satır sınırında olduğundan ayrı dosya). Kural aynıdır: ekranda
 * panel jargonu (`PANEL_JARGON`) yok; cümleler ana sözlükten türer (`CONFIDENCE_PLAIN`, `liftPhrase`, `PLAIN_TERMS`, `OUTLIER_PLAIN`).
 * Yeni terim önce buraya girer, sonra ekran ondan türetilir. Saf (sunucu/istemci), hesap/marka adı gömülmez.
 */
import { hookTypeLabel } from "@/lib/domain/hook-types";
import type { AvoidEntry, ConfidenceLevel, FocusGroup } from "@/lib/domain/weekly-plan";
import { formatDecimal, formatNumber, LOCALE } from "@/lib/format";
import { CONFIDENCE_PLAIN, liftPhrase, PANEL_JARGON, PLAIN_TERMS } from "@/lib/plain-language";

/** Cümle başı büyük harf (tr-TR: "izleyiciden" → "İzleyiciden"). */
export const upperFirst = (text: string): string => text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);

/**
 * Sebep metni panel jargonu taşıyorsa müşteriye gösterilmez, yerine `fallback` yazılır. `lib/insights/*` sebep cümlelerini artık kaynağında
 * düz dille kurar (bu dosyanın "Sebep cümleleri" bölümü; `insights/plain-reasons.test.ts` korur); bu süzgeç yalnız eski kayıtlı planlara
 * ve beklenmedik bir sapmaya karşı emniyettir, normal akışta devreye girmez.
 */
export function plainOrFallback(text: string | undefined, fallback: string): string {
  const trimmed = text?.trim();
  return trimmed && !PANEL_JARGON.test(trimmed) ? trimmed : fallback;
}

// -------------------------------------------------------------------- Güven

/** Güven rozeti metni: "Kısmen eminim" (her ekranda `CONFIDENCE_PLAIN` ile aynı söz). */
export const confidenceBadgePlain = (level: ConfidenceLevel): string => upperFirst(CONFIDENCE_PLAIN[level]);

/** Güven balonunun ilk cümlesi: "12 videoya dayanıyor." Sayı yoksa undefined. */
export const confidenceBasisPlain = (count: number | undefined): string | undefined => {
  const text = formatNumber(count);
  return text === undefined ? undefined : `${text} videoya dayanıyor.`;
};

/** Karşılaştırma tabanı az videoya dayanıyorsa güven en çok "orta"dır. */
export const CONFIDENCE_CAPPED_PLAIN = `Karşılaştırma için baktığım videolar az olduğu için en çok “${CONFIDENCE_PLAIN.medium}” diyebiliyorum.`;

// ------------------------------------------------------------------- Açılış

/** "Hook" yerine "açılış cümlesi" (karar: raporun kullandığı terim). `PLAIN_TERMS.hook` ilk saniyelerin kendisidir. */
export const OPENING_PLAIN = {
  /** Cümle başı: "Açılış cümlesi izleyiciye … seslenerek başlıyor". */
  lead: "Açılış cümlesi",
  options: "Açılış cümlesi önerileri",
  none: "Açılış cümlesi önerisi yok.",
  notProduced: "Açılış cümlesi önerilmedi.",
  copy: "Açılış cümlesini kopyala",
  unknown: "Açılış tarzı —",
  unknownHint: "Bu fikrin açılış tarzı belirlenemedi (dayandığı videoların incelemesi yetersiz).",
  /** Kart rozeti: "Açılış: Cesur iddia". */
  badge: (type: string): string => `Açılış: ${hookTypeLabel(type)}`,
  /** Fikir gerekçesinde: "en güçlü örnek “Cesur iddia” tarzında açılıyor". */
  leadsWith: (type: string): string => `en güçlü örnek “${hookTypeLabel(type)}” tarzında açılıyor`,
} as const;

// ------------------------------------------------------------------ Ölçütler

const factorText = (factor: number): string => (Number.isInteger(factor) ? (formatNumber(factor) ?? "") : (formatDecimal(factor, 1) ?? ""));

/** Tutan videonun ölçütü: `atLeastTimesPlain(3)` → "normalinin en az 3 katı izlenenler". */
export const atLeastTimesPlain = (factor: number): string => `normalinin en az ${factorText(factor)} katı izlenenler`;

export const WINNERS_PLAIN = {
  criteria: (days: number, factor: number): string => `son ${days} gün · ${atLeastTimesPlain(factor)}`,
  relaxedBadge: "Ölçüt indirildi",
  relaxedHint: (factor: number): string => `Yeterince tutan video bulamadım; bu yüzden ölçütü indirdim: ${atLeastTimesPlain(factor)}.`,
  openingLabel: "Açılış",
  notAnalyzed: "Video henüz incelenmedi.",
  unverified: "Videoyu inceledim ama açılış cümlesini videoda doğrulayamadım.",
  noWhy: "“Neden tuttu” metni hazırlanamadı.",
  unverifiedWhy: "Açılış cümlesini videoda doğrulayamadığım için açılış tarzı ve “neden tuttu” gösterilmiyor.",
  noneInPeriod: "Bu ölçütü geçen video yok.",
  noOwn: "Bu ölçütü geçen kendi videon yok.",
  unmeasured: "Son günlerde normaline göre ölçebildiğim video yok.",
} as const;

// -------------------------------------------------------------- Yönler, kaçın

/** Yön grubunun adı. */
export const FOCUS_GROUP_PLAIN: Record<FocusGroup, string> = {
  hook_type: upperFirst(PLAIN_TERMS.hookType.say),
  duration_bucket: "Süre",
  cta_type: upperFirst(PLAIN_TERMS.cta.say),
  topic_cluster: "Konu",
};

export const FOCUS_PLAIN = {
  description: `Rakiplerde işe yarayan, senin henüz denemediğin yönler öne çıkar. Az videoya dayanan yönde “${CONFIDENCE_PLAIN.low}” yazar.`,
  unmeasured: "Yön önerisi için yeterli veri yok.",
  unmeasuredImpact: "Rakiplerde ne kadar tuttuğunu ölçemedim.",
  tried: "Sen bunu denedin.",
  notTried: "Sen bunu henüz denemedin.",
  evidenceLabel: "Dayandığı videolar",
  /** Bağlantının görünen metni "1. video"; ekran okuyucu ardından hangi yönün dayanağı olduğunu da okur. */
  evidenceLinkText: (position: number): string => `${position}. video`,
  evidenceLinkHidden: (direction: string): string => ` ${direction} yönünün dayanağı`,
} as const;

/** Yönün ilk cümlesi: "Rakiplerde tipik video normalinin 5,9 katı izlendi." Etki ölçülemediyse undefined (ekran `MeasuredValue` ile tire + sebep yazar). */
export function focusTypicalPlain(impact: number | undefined): string | undefined {
  const typical = liftPhrase(impact);
  return typical === undefined ? undefined : `Rakiplerde tipik video ${typical}.`;
}

/** Yönün düz özetinin geri kalanı (yapısal alanlardan; sunucu cümlesi jargon taşıyabildiğinden ekran bunu kullanır). */
export function focusFactsPlain(direction: { sampleSize: number; ownTried: boolean }): string {
  return [confidenceBasisPlain(direction.sampleSize), direction.ownTried ? FOCUS_PLAIN.tried : FOCUS_PLAIN.notTried].filter((part) => part !== undefined).join(" ");
}

/** Yön grubunun ekran adı + değer ("Süre: 30–60 sn"): sebep cümlelerinin başı (`FOCUS_GROUP_PLAIN`; "Hook türü" değil "Açılış tarzı"). */
export const groupTitlePlain = (group: FocusGroup, label: string): string => `${FOCUS_GROUP_PLAIN[group]}: ${label}`;

export const AVOID_KIND_PLAIN: Record<AvoidEntry["kind"], string> = { low_lift: "Az izlenen", off_niche: "Konuyla ilgisiz" };

export const avoidGroupPlain = (entry: Pick<AvoidEntry, "group">): string => (entry.group === "off_niche" ? "Konu dışı" : FOCUS_GROUP_PLAIN[entry.group]);

export const AVOID_PLAIN = {
  empty: "Bu hafta için kaçınılacak belirgin bir grup çıkmadı (en az 2 videoluk, normalin altında kalan grup yok).",
  /** "Soru: 5 videoya baktım; tipik video normalinin 0,4 katı izlendi." */
  lowSentence: (label: string, sampleSize: number, medianLift: number | undefined): string => {
    const typical = liftPhrase(medianLift);
    return `${label}: ${formatNumber(sampleSize) ?? "0"} videoya baktım${typical === undefined ? "." : `; tipik video ${typical}.`}`;
  },
  offNicheFallback: "Hesabının konusunun dışında kalan videolar.",
} as const;

// --------------------------------------------------------------- Yedek içerik

/** "Aday" yerine "yedek" (Bugün ve rapor da böyle der). */
export const ALTERNATIVES_PLAIN = {
  title: "Yedekte bekleyenler",
  intro: "Hazırladım ama bu haftaya almadım; sıralı.",
  count: (n: number): string => `${formatNumber(n) ?? "0"} yedekte`,
  basis: (n: number): string => confidenceBasisPlain(n)?.replace(/\.$/, "") ?? "",
  badge: "yedekte",
} as const;

// --------------------------------------------------------------- Geçen hafta

export const REVIEW_PLAIN = {
  intro: (range: string): string => `${range} planının sonucu: 1., 3. ve 7. gün izlenmesi, 7. günün normaline göre durumu ve yönlerin tutup tutmadığı.`,
  columns: { item: "Plan öğesi", link: "Yayın", day7: "7. gün: normaline göre", verdict: "Yön tuttu mu?" },
  notMeasured: "Henüz ölçülmedi",
  noDirection: "Bu yayın plan yönlerinden birine uymadı.",
  noLink: "Bağlantı yok (yayınlandı mı bilinmiyor)",
  linkAction: (noun: string): string => `Fikir kartında ${noun} bağla`,
  awaitingHint: (noun: string): string => `${noun} bağlantısı verildi ama içerik henüz toplanmadı; bir sonraki toplamada eşleşir.`,
  followerSuffix: "takipçi başına",
  noLink7: "İçerik bağlı değil: ölçüm yok.",
  noDay7: "7. gün ölçümü yok.",
  summary: (s: { planned: number; linked: number; measuredD7: number; held: number; missed: number; unmeasured: number }): string =>
    `Plana giren ${formatNumber(s.planned)} · bağlı yayın ${formatNumber(s.linked)} · 7. gün sonucu alınan ${formatNumber(s.measuredD7)} · yönler: ${formatNumber(s.held)} tuttu, ${formatNumber(s.missed)} tutmadı, ${formatNumber(s.unmeasured)} ölçülemedi.`,
} as const;

/** "Ölçüm zamanı geldi" şeridi: platform adı sızmasın diye "yayın". */
export const MEASUREMENT_DUE_PLAIN = {
  headline: (n: number): string => `${formatNumber(n)} yayının ölçümü geldi.`,
  more: (n: number): string => `+ ${formatNumber(n)} yayın daha`,
} as const;

// --------------------------------------------------------------- Plan ekranı

export const PLAN_SCREEN_PLAIN = {
  /** Plan başlığı: "Hazırlandı" (rapordaki söz ile aynı). */
  generated: "Hazırlandı",
  inPlan: (n: number): string => `${formatNumber(n)} içerik planda`,
  /** Plansız hafta, müşteri görünümü: ne zaman / kim sorusunu dürüstçe yanıtlar (tur elle başlatılır, takvim sözü yok). */
  emptyWeekOperator: "Planı hazırlayınca burada görünür; PDF olarak kaydedebilirsin.",
  emptyOperator: "Planı hazırlayınca burada görünür.",
  emptyWeekBody: "Planı yöneticin hazırlar; hazır olunca bu sayfada görünür ve PDF olarak kaydedebilirsin.",
  emptyBody: "Planı yöneticin hazırlar; hazır olunca burada görünür.",
  /** Plan onayı (SPN-35): onay fikirleri seçer; para harcamaz, çekim ayrı adımdır. */
  approve: "Planı onayla",
  approving: "Onaylanıyor…",
  approveNote: "Onaylayınca plandaki fikirler seçilmiş olur. Para harcanmaz; üretimi sonra sen başlatırsın.",
  approveFailed: "Plan onaylanamadı. Bağlantını kontrol edip tekrar dene.",
  approvedBadge: (date: string): string => `Onaylandı · ${date}`,
  approvedDone: "Plan onaylandı; fikirlerin seçildi.",
  /** Fikri sohbetle değiştirme (SPN-35): düğme Asistan'ı açar; ne değişeceğini Asistan sorar. */
  revise: "Sohbetle değiştir",
  reviseAsk: (title: string): string => `"${title}" fikrini değiştirmek istiyorum.`,
  reviseUnavailable: "Asistan şu an açılamıyor.",
} as const;

// ---------------------------------------------------------------- Fikir kartı

export const IDEA_PLAIN = {
  evidenceTitle: "Dayandığı videolar",
  evidenceNote: "(fikir hazırlanırken ne kadar tuttuğu)",
  noEvidence: "Bu fikre bağlı video yok.",
  oneEvidence: "Yalnız 1 video var; bir fikir için en az 2 gerekir.",
  scriptTitle: "Senaryo",
  scriptSteps: "Çekim adımları",
  scriptSpoken: "Söyleyeceğin metin (kendi sesinde)",
  scriptEmpty: "Senaryo henüz yok.",
  scriptCopy: "Senaryoyu kopyala",
  /** Yalnız yönetici görünümünde: puanın adı. */
  scoreLabel: "Öncelik puanı",
  scoreHint: "Fikrin öne alınma sırası: normalinin kaç katı izlendiği × yenilik × kendi başarılı içeriğe benzerlik.",
  ctaPrefix: "Sonunda",
  notFound: "Bu fikir artık listede değil.",
  notFoundHint: "Silinmiş ya da elenmiş olabilir; tüm fikirler aşağıda.",
  undo: "Geri al",
  dismissed: "Fikir elendi.",
} as const;

// ------------------------------------------------------------ Sebep cümleleri

/** Tipik videonun durumu: "normalinin 2,3 katı izlendi"; ölçülemediyse (`undefined`) "normaline göre ölçülemedi". */
const typicalPlain = (impact: number | undefined): string => liftPhrase(impact) ?? "normaline göre ölçülemedi";

/** Sunucunun yazdığı sebep cümleleri (`lib/insights/*`: yön gerekçesi, kaçın, ne tuttu, takvim). Ekran bunları olduğu gibi gösterebilir. */
export const REASON_PLAIN = {
  /** "Süre: 30–60 sn: kendi tutanların arasında tipik video normalinin 2,3 katı izlendi (5 video, 2 tanesi tutan)." */
  focusOwn: (title: string, basis: string, g: { sampleSize: number; impact: number | undefined; outliers: number }): string =>
    `${title}: ${basis} arasında tipik video ${typicalPlain(g.impact)} (${formatNumber(g.sampleSize)} video, ${formatNumber(g.outliers)} tanesi tutan).`,
  focusRivals: (title: string, g: { sampleSize: number; impact: number | undefined; outliers: number; ownTried: boolean }): string =>
    `${title}: rakiplerde tipik video ${typicalPlain(g.impact)} (${formatNumber(g.sampleSize)} video, ${formatNumber(g.outliers)} tanesi tutan); ${g.ownTried ? "kendi hesabında denendi." : "kendi hesabında henüz denenmedi."}`,
  focusRepeat: (label: string, basis: string, g: { sampleSize: number; impact: number | undefined }): string =>
    `${label}: ${basis} arasından en çok tutanlar (${formatNumber(g.sampleSize)} video, tipik video ${typicalPlain(g.impact)}): aynı konuyu yeni bir açıyla ya da “2. bölüm” olarak yeniden çek.`,
  focusNone: {
    ownUnmeasured: "Kendi videolarının normaline göre durumu ölçülemedi (karşılaştıracak geçmiş yok ya da videolar çok yeni).",
    ownNone: "Kendi videolarında normalin üstünde kalan, en az 2 videolu grup yok.",
    noRivalVideos: "Rakiplerde gruplanabilecek kısa video yok.",
    rivalUnmeasured: "Rakip videolarının normaline göre durumu ölçülemedi (karşılaştıracak geçmiş yok ya da videolar çok yeni).",
    notComparable: "Normalin üstünde kalan, en az 2 videolu karşılaştırılabilir grup yok; kendi videoların incelenmediği başlıklar atlandı.",
    none: "Normalin üstünde kalan, en az 2 videolu grup yok.",
  },
  avoidLow: (title: string, own: boolean, g: { sampleSize: number; impact: number | undefined; outliers: number }): string =>
    `${title}: ${own ? "kendi videolarında" : "rakiplerde"} ${formatNumber(g.sampleSize)} videoya baktım; tipik video ${typicalPlain(g.impact)} (${formatNumber(g.outliers)} tanesi tutan).`,
  avoidOffNiche: (handle: string, screened: number, offNiche: number, share: string): string =>
    `@${handle}: konu kontrolünden geçen ${formatNumber(screened)} videonun ${formatNumber(offNiche)} tanesi hesabının konusu dışında (${share}); bunları yönlere ve fikirlere katmadım.`,
  /** `days` günlük pencerede normaline göre ölçülebilen video yok. */
  winnersNoRival: (days: number): string => `Son ${days} günde normaline göre ölçebildiğim rakip videosu yok.`,
  winnersNoOwn: (days: number): string => `Son ${days} günde normaline göre ölçebildiğim kendi videon yok.`,
  /** Geçen haftaların sonucu: "Geçen haftalarda bu yön tuttu (2 yayına baktım: 2 tuttu, 0 tutmadı)." */
  feedback: (verdict: string, n: number, held: number, missed: number): string =>
    `Geçen haftalarda bu yön ${verdict} (${formatNumber(n)} yayına baktım: ${formatNumber(held)} tuttu, ${formatNumber(missed)} tutmadı).`,
  scheduleBestHour: "Kendi en iyi saatin: bu saatteki videoların tipik izlenmesi en yüksek.",
  scheduleGoodHour: "Kendi videoların bu saatte normalinin üstünde kalmış (örnek az).",
  scheduleSpread: "Tek saate yığılmasın diye paylaşımların en çok dörtte üçü bu saatte; kalanı keşif.",
  scheduleFewSamples: (n: number): string => ` Yalnız ${formatNumber(n)} videoya dayanıyor (az örnek): paylaşımların en çok yarısı bu saatte.`,
  scheduleSingleHour: (n: number, confident: boolean): string =>
    `${confident ? `Kendi en iyi saatin tek saat (${formatNumber(n)} videoya dayanıyor)` : `Kendi en iyi saatin yalnız ${formatNumber(n)} videoya dayanıyor`} ve çeşitlendirecek başka saat verisi yok; paylaşımların hepsi aynı saatte.`,
  scheduleTooFewDays: (wanted: number, got: number): string => `Haftanın kalan günleri yetmiyor: ${formatNumber(wanted)} yerine ${formatNumber(got)} paylaşım önerildi.`,
  /** Plan modu notu (plan notlarında). */
  modeOwn: (measuredRivals: number, needed: number): string =>
    `Plan, kendi tutan videolarından öğreniyor (rakip verisi yetersiz: normaline göre ölçebildiğim ${formatNumber(measuredRivals)} rakip videosu var, en az ${formatNumber(needed)} gerekli). Yönler, fikirler ve dayandıkları videolar kendi videolarından geliyor; “denemedin” avantajı uygulanmadı.`,
  modeRivals: "Plan, rakiplerde tutanlardan öğreniyor (yönler, fikirler ve dayandıkları videolar rakip videolarından geliyor; kendi hesabında denemediğin yaklaşım öne çıkar).",
} as const;
