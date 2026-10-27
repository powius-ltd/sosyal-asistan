/**
 * Yaklaşım haritası (açı × farkındalık) ve konu haritası (konu × hook türü) ekranlarının MÜŞTERİYE görünen terimleri. Karar: "kreatif
 * matris" yerine "yaklaşım haritası", "açı" → "yaklaşım", "farkındalık katmanı" → "izleyici", "hücre" → "kutu", "ön matris" →
 * "beklenen uyum", "hook" → "açılış". Terimler ana sözlükten (`lib/plain-language.ts`: `ANGLE_PLAIN`, `liftPhrase`, `OUTLIER_PLAIN`) ve
 * `lib/plain-language-results.ts`'ten türer; yeni terim önce buraya girer. Saf (sunucu/istemci).
 */
import { CELL_STATUS_LABEL, PRIOR_FIT_LABEL, type CellStatus, type CreativeAngle, type FunnelStage, type PriorFit } from "@/lib/domain/creative-matrix";
import { LOCALE } from "@/lib/format";
import type { TopicCellStatus } from "@/lib/domain/topic-hook-matrix";
import { ANGLE_PLAIN, liftPhrase, PLAIN_TERMS } from "@/lib/plain-language";
import { upperFirst } from "@/lib/plain-language-plan";

// ------------------------------------------------------------ Eksenler

/** Yaklaşım (açı) sütun başlığı: "Acı / korku". */
export const ANGLE_COLUMN_PLAIN = Object.fromEntries(
  (Object.entries(ANGLE_PLAIN) as [CreativeAngle, string][]).map(([key, text]) => [key, upperFirst(text)]),
) as Record<CreativeAngle, string>;

/** İzleyici (farkındalık katmanı) satır başlığı. */
export const STAGE_ROW_PLAIN: Record<FunnelStage, string> = {
  "hic-farkinda-degil": "Sorundan habersiz",
  "sorunu-biliyor": "Sorunu biliyor",
  "cozum-ariyor": "Çözüm arıyor",
  "urunu-biliyor": "Seçenekleri karşılaştırıyor",
  "sicak-musteri": "Almaya hazır",
};

/** İzleyici, cümle içinde: "sorunu bilen izleyici". */
export const STAGE_AUDIENCE_PLAIN: Record<FunnelStage, string> = {
  "hic-farkinda-degil": "sorundan habersiz izleyici",
  "sorunu-biliyor": "sorunu bilen izleyici",
  "cozum-ariyor": "çözüm arayan izleyici",
  "urunu-biliyor": "seçenekleri karşılaştıran izleyici",
  "sicak-musteri": "almaya hazır izleyici",
};

/** Kutunun adı (başlık, ekran okuyucu): "Acı / korku yaklaşımı · sorunu bilen izleyici". */
export const angleCellTitle = (cell: { stage: FunnelStage; angle: CreativeAngle }): string =>
  `${ANGLE_COLUMN_PLAIN[cell.angle]} yaklaşımı · ${STAGE_AUDIENCE_PLAIN[cell.stage]}`;

// ------------------------------------------------------------- Durumlar

/** Kutuda kısa durum (dar kutuya sığar). */
export const CELL_STATUS_SHORT: Record<CellStatus, string> = {
  proven_opportunity: "Rakipte tutuyor",
  tried: "Denedin",
  weak: "Az tutuyor",
  unmeasured: "Ölçülemedi",
  empty: "Kimse denemedi",
};

/** Ayrıntıda tam durum cümlesi (domain sözlüğü zaten düz dildir; analist de aynısını okur). */
export const CELL_STATUS_LONG: Record<CellStatus, string> = CELL_STATUS_LABEL;

/** Konu haritasının kutu durumları (`worked` = kendi videolarında tuttu). */
export const TOPIC_STATUS_SHORT: Record<TopicCellStatus, string> = {
  proven_opportunity: CELL_STATUS_SHORT.proven_opportunity,
  worked: "Sende tuttu",
  tried: CELL_STATUS_SHORT.tried,
  weak: CELL_STATUS_SHORT.weak,
  unmeasured: CELL_STATUS_SHORT.unmeasured,
  empty: "Boş",
};

export const TOPIC_STATUS_LONG: Record<TopicCellStatus, string> = {
  proven_opportunity: CELL_STATUS_LONG.proven_opportunity,
  worked: "Senin videolarında tuttu",
  tried: CELL_STATUS_LONG.tried,
  weak: CELL_STATUS_LONG.weak,
  unmeasured: CELL_STATUS_LONG.unmeasured,
  empty: "Kimse denemedi",
};

/** Beklenen uyum (ön matris): genel deneyime göre bu yaklaşımın bu izleyiciye ne kadar yakıştığı. Önseldir, kesin değildir. */
export const PRIOR_LEVEL_PLAIN = Object.fromEntries(
  (Object.entries(PRIOR_FIT_LABEL) as [PriorFit, string][]).map(([key, text]) => [key, text.toLocaleLowerCase(LOCALE)]),
) as Record<PriorFit, string>;
export const PRIOR_LABEL = "Beklenen uyum";
export const priorBadgeText = (prior: PriorFit): string => `${PRIOR_LABEL}: ${PRIOR_LEVEL_PLAIN[prior]}`;
/** Dar kutudaki rozet yazısı: "Uyum: iyi" (tam ad balonda ve ekran okuyucu etiketinde). */
export const priorBadgeShort = (prior: PriorFit): string => `Uyum: ${PRIOR_LEVEL_PLAIN[prior]}`;

/** Beklenen uyum rozetinin balonu (beklenti olduğu hep söylenir; veri aksini gösterebilir). */
export function priorHint(prior: PriorFit, status: CellStatus): string {
  const base: Record<PriorFit, string> = {
    birincil: "Genel deneyime göre bu yaklaşım bu izleyiciye en çok yakışır.",
    ikincil: "Genel deneyime göre bu yaklaşım bu izleyicide işe yarar ama ilk tercih değildir.",
    aykiri: "Genel deneyime göre bu yaklaşım bu izleyicide genelde zayıf kalır.",
  };
  const note =
    prior === "aykiri" && status === "proven_opportunity"
      ? " Buna rağmen rakipte tutuyor: beklenti bu kutuda yanılıyor olabilir."
      : prior === "birincil" && status === "empty"
        ? " Yakışması beklenen ama kimsenin denemediği bir kutu."
        : "";
  return `${base[prior]} Bu bir beklentidir, kesin değildir; veri aksini gösterebilir.${note}`;
}

// ------------------------------------------------------------- Cümleler

/** "tipik video normalinin 3,2 katı izlendi" ya da ölçülemediyse "normaline göre ölçülemedi". */
export function typicalPhrase(lift: number | undefined): string {
  const phrase = liftPhrase(lift);
  return phrase === undefined ? "normaline göre ölçülemedi" : `tipik video ${phrase}`;
}

/** Güven düşükse sayının dayanağı: "(az örnek: 1 ölçülmüş video)". */
export const lowSampleNote = (count: string): string => ` (az örnek: ${count} ölçülmüş video)`;

/** Tutan sayısı: "2 tanesi tutan". */
export const outlierCountPhrase = (count: string): string => `${count} tanesi tutan`;

/** "En iyi videoların" ve fırsat cümlesi gövdesi: "rakiplerde 6 video". */
export const rivalsVideoPhrase = (count: string): string => `rakiplerde ${count} video`;

// -------------------------------------------------------- Ekran metinleri

export const ANGLE_MAP_PLAIN = {
  title: "Yaklaşım haritası",
  intro: (days: string): string =>
    `Hangi yaklaşım hangi izleyicide tutuyor, sen nerede denedin, nerede boşluk var? Son ${days} günün kısa videoları; rakip = izlenen rakipler, sen = kendi hesapların.`,
  counters: { looked: "videoya baktım", notLooked: "videoya henüz bakmadım" },
  empty: { title: "Videolara henüz bakmadım", fallback: "Videoların hangi yaklaşımla çekildiğine henüz bakmadım; bakınca harita dolar.", lead: "Bakmak için:" },
  corner: "İzleyici ↓ · Yaklaşım →",
  caption: "Yaklaşım haritası: izleyici satırları, yaklaşım sütunları",
  gridLabel: "Yaklaşım haritası tablosu",
  opportunities: {
    title: "Denemediğin yaklaşımlar",
    empty: "Şimdilik kanıtlı fırsat yok: rakiplerde normalinin üstünde izlenip senin denemediğin yaklaşım yok.",
  },
  footnote:
    "Rozet, bu yaklaşımın bu izleyiciye genelde ne kadar yakıştığını söyler; bu bir beklentidir, veri farklı gösterebilir. Bir kutuya basınca örnek videolar altta açılır ve sayfa oraya kayar.",
  rows: { rivals: "Rakip", you: "Sen", opening: "Açılış", tried: "denedin", notTried: "denemedin", videos: "video", outliers: "tutan" },
  detail: {
    label: "Kutu ayrıntısı",
    close: "Kapat",
    rivalsAndOwn: (rivals: string, own: string): string => `Rakip ${rivals} video, kendi ${own} video`,
    openings: "En çok kullanılan açılış tarzları: ",
    noVideos: "Bu kutuda video yok: ne sen ne de izlediğin rakipler bu yaklaşımı bu izleyiciye denemiş.",
    open: "Ayrıntıyı aç",
  },
  missing: "Bu yaklaşım listede yok; adres eski ya da hatalı olabilir. Aşağıdaki haritadan bir kutu seçebilirsin.",
  missingTopic: "Bu hesap türünde konu haritası yok; adres bir konu kutusuna işaret ediyordu.",
  missingAngle: "Bu hesap türünde yaklaşım haritası yok; adres bir yaklaşım kutusuna işaret ediyordu.",
} as const;

export const TOPIC_MAP_PLAIN = {
  title: "Konu ve açılış haritası",
  intro: (days: string, withRivals: boolean): string =>
    `Hangi konuda hangi açılış tarzıyla tutturdun, nerede boşluk var? Son ${days} günün kısa videoları; sen = kendi hesapların${withRivals ? ", rakip = izlenen rakipler" : ""}. Değer, videonun o hesabın normal izlenmesinin kaç katı izlendiğidir.`,
  counters: { grouped: "video bir konuya girdi", ungrouped: "video henüz konusuz", noRivals: "izlenen rakip yok: yalnız kendi videoların" },
  empty: { title: "Konu grupları henüz yok", note: "Konu grupları plan hazırlanırken oluşur." },
  corner: "Konu ↓ · Açılış tarzı →",
  caption: "Konu ve açılış haritası: konu satırları, açılış tarzı sütunları",
  gridLabel: "Konu ve açılış haritası tablosu",
  own: "kendi",
  rival: "rakip",
  hidden: (n: string): string => `Videosu olmayan ${n} açılış tarzı sütunu gizlendi.`,
  winners: {
    title: "En iyi videoların",
    empty: "Şimdilik tutan kutu yok: kendi videoların hiçbir konu ve açılış tarzında normalinin üstüne çıkmadı.",
    best: "En iyi videon: ",
  },
  opportunities: {
    title: "Denemediğin açılışlar",
    withRivals: "Şimdilik kanıtlı fırsat yok: rakiplerde normalinin üstünde izlenip senin denemediğin konu ve açılış yok.",
    noRivals: "İzlenen rakip videosu yok: fırsat rakipte tutanı gösterir. Rakip ekleyince burada çıkar; o zamana dek yukarıdaki kendi tutanların yol gösterir.",
  },
  footnote: "Bir kutuya basınca örnek videolar altta açılır ve sayfa oraya kayar. Tek videolu kutularda emin olmam zor: rozet bunu gösterir.",
  detail: { noVideos: "Bu kutuda video yok: bu konuda bu açılış tarzıyla kimse denememiş." },
  missing: "Bu konu ve açılış kutusu haritada yok; adres eski ya da hatalı olabilir. Aşağıdaki haritadan bir kutu seçebilirsin.",
} as const;

/** Haritanın sayfa başlığı ve açıklaması (hesap türünün haritalarına göre). */
export const MAP_DESCRIPTION_PLAIN = {
  angle_funnel: "Hangi yaklaşım hangi izleyicide tutuyor ve nerede boşluk var",
  topic_hook: "Hangi konuda hangi açılış tarzı tutuyor ve nerede boşluk var",
} as const;

export const MAP_TITLE_PLAIN = { angle_funnel: ANGLE_MAP_PLAIN.title, topic_hook: TOPIC_MAP_PLAIN.title } as const;

/** Haritalar için kısa ad (Ayarlar açıklaması). */
export const MAP_KIND_PLAIN = { angle_funnel: "Yaklaşım × izleyici", topic_hook: "Konu × açılış" } as const;

/** Rakipte tutan ama senin denemediğin yaklaşım, ana sözlükteki ifade (`PLAIN_TERMS.opportunity`). */
export const OPPORTUNITY_SAY = PLAIN_TERMS.opportunity.say;
