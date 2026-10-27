/**
 * Haftalık plan kuralı eşikleri (docs/FAZ2-PLAN.md §5) — TEK yer. Kural değişirse burası ve testi değişir; modüller sabit
 * gömmez. Lift kademe eşikleri `domain/content.ts` `LIFT_TIER_MIN`'dedir (3x = kademe 3, 2x = kademe 2, 1,5x = kademe 1).
 */
import { LIFT_TIER_MIN } from "@/lib/domain/content";

// ------------------------------------------------------------------ Ne tuttu
/** Rakip tutan: son 30 gün, ≥ 3x; 3'ten az varsa ≥ 2x'e gevşer (işaretli); en çok 5. */
export const RIVAL_WINNER_DAYS = 30;
export const RIVAL_WINNER_MIN_LIFT = LIFT_TIER_MIN[3];
export const RIVAL_WINNER_RELAXED_LIFT = LIFT_TIER_MIN[2];
export const RIVAL_WINNER_MIN_STRONG = 3;
export const RIVAL_WINNER_MAX = 5;
/** Kendi tutan: son 90 gün, ≥ 1,5x; en çok 3. */
export const OWN_WINNER_DAYS = 90;
export const OWN_WINNER_MIN_LIFT = LIFT_TIER_MIN[1];
export const OWN_WINNER_MAX = 3;

// ------------------------------------------------------------- Yön ve kaçın
/** Grup istatistiği penceresi (rakip içerikleri, gün). */
export const GROUP_WINDOW_DAYS = 90;
/** Bir grubun yön/kaçın olması için lift'i ölçülmüş en az video. */
export const GROUP_MIN_N = 2;
/** Kendi hesap o grubu hiç denemediyse yenilik çarpanı (denediyse 1). */
export const NOVELTY_UNTRIED = 1.5;
/**
 * Etki büzme sabiti: az örnekli grubun etkisi baza (1) çekilir, `etki' = 1 + (etki − 1)·n/(n + K)`. n=2'de 6,9x → ≈2,7; n=5'te 4,5x → 2,75:
 * iki videoluk uç değer, çok örnekli ılımlı yönün önüne geçmez. Yalnız SIRALAMA puanında; gösterilen etki ham kalır.
 */
export const IMPACT_SHRINK_K = 5;
export const FOCUS_MIN = 2;
export const FOCUS_MAX = 3;
export const AVOID_LOW_LIFT_MAX = 3;
export const AVOID_OFF_NICHE_MAX = 3;
/**
 * Hesap düzeyinde "niş dışı": en az bu kadar ELENMİŞ video ve bunların ≥ bu payı niş dışı. Aksi halde (ör. 1 videoya bakıp hesabı
 * niş dışı ilan etmek) yalnız video düzeyinde kalır: o video öğrenmeye girmez, hesap "kaçın"a yazılmaz.
 */
export const AVOID_OFF_NICHE_MIN_SCREENED = 3;
export const AVOID_OFF_NICHE_MIN_SHARE = 0.6;

// ------------------------------------------------------------------- Adaylar
/** Aday tohumu (rakip tutanı): ≥ 3x; 5'ten az varsa ≥ 2x'e gevşer. */
export const CANDIDATE_SEED_MIN_STRONG = 5;
export const CANDIDATE_SEED_MAX = 10;
/** Kanıt: tohum + aynı yöndeki, baz çizgisinin ≥ 1,5 katı destekçi videolar; en çok 4. */
export const CANDIDATE_EVIDENCE_MIN_LIFT = LIFT_TIER_MIN[1];
export const CANDIDATE_EVIDENCE_MAX = 4;
export const CANDIDATE_EVIDENCE_MIN = 2;
export const CANDIDATE_LIMIT = 8;
/** Kanıtların tamamı kendi tutan konu kümelerindeyse rank çarpanı 1 + bu. */
export const OWN_TOPIC_FIT_BOOST = 0.25;

// ------------------------------------------------------------ Rakipsiz mod
/**
 * Rakip verisi yetersizse (pencerede ölçülmüş rakip videosu < bu sayı VE rakip verisinden yön çıkmıyorsa) plan KENDİ tutanlarından öğrenir
 * ("own" modu, `mode.ts`). Rakip verisi yeterliyse ya da yön çıkarıyorsa davranış aynen kalır ("rivals").
 */
export const RIVAL_DATA_MIN = 5;
/**
 * Kendi tutan (aday tohumu, kanıt): ≥ 3x; 5'ten az varsa kendi "ne tuttu" eşiğine (≥ 1,5x, `OWN_WINNER_MIN_LIFT`) gevşer ve işaretlenir. Kendi baz
 * çizgisinin 1,5 katı zayıf ama gerçek bir kanıttır; kendi verisi azken planı boş bırakmaktansa "zayıf kanıt" işaretiyle sürer.
 */
export const OWN_SEED_MIN_LIFT = LIFT_TIER_MIN[3];
export const OWN_SEED_RELAXED_LIFT = LIFT_TIER_MIN[1];
/** Rakipsiz modda "ne tuttu"da gösterilen kendi tutan sayısı (rakip bölümü boş olduğundan 3 yerine 5). */
export const OWN_MODE_WINNER_MAX = 5;
/** "Tekrarla / seriye çevir" yönü: en çok bu kadar kendi tutan (≥ 3x; yoksa ≥ 2x) kanıt olur. */
export const REPEAT_WINNERS_MAX = 3;

// ------------------------------------------------------------------- Takvim
/** Kadans için rakipte en az tarihli video; "sabit saat" için en az video ve en sık saatin payı. */
export const CADENCE_MIN_POSTS = 3;
export const FIXED_HOUR_MIN_VIDEOS = 5;
export const FIXED_HOUR_MIN_SHARE = 0.5;
/** Kendi "iyi saat": o saatte en az bu kadar video, medyan lift ≥ 1. */
export const OWN_GOOD_HOUR_MIN_N = 2;
/**
 * Kendi en iyi saati bu kadar videoya (en iyi gün×saat dilimlerindeki toplam paylaşım) dayanmıyorsa az örnektir: slotların en çok
 * `OWN_BEST_THIN_MAX_SHARE`'i o saate konur, kalanı keşif olarak rakip yaygın saatlerinden / kendi diğer iyi saatlerinden seçilir.
 */
export const OWN_BEST_CONFIDENT_N = 5;
export const OWN_BEST_THIN_MAX_SHARE = 0.5;
/** Güvenilir (≥ 5 videoluk) TEK en iyi saat bile slotların en çok bu kadarını alır (4 slotta 3); kalanı keşif (hepsi aynı saatte kalmasın). */
export const OWN_BEST_MAX_SHARE = 0.75;
/** Rakibin "yaygın saati": o saatte en az bu kadar video (tek videoluk saat yaygın değildir). */
export const RIVAL_COMMON_HOUR_MIN_N = 2;
/** Hiç saat verisi yoksa varsayılan slot saati (hedef kitle diliminde). */
export const DEFAULT_SLOT_HOUR = 19;
