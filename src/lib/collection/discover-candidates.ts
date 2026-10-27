/**
 * Rakip adayı keşfinin SAF kuralları (DB / ağ / saat yok): aday süzme, ortak yazar sıralaması, arama sorgusu seçimi, benzer boy sayımı.
 *
 * Aday kuralı (tek yerde): kullanıcı adı platform modülünün normalizasyonundan geçer ve `HANDLE_PATTERN`'e uyar · aday kendi hesapla AYNI
 * platformdandır (`rivalPlatformProblem`) · kendi hesap, zaten kayıtlı rakip (her durumda: aday, izlenen, yoksayılan, gizli) ve aynı turda
 * tekrar gelen ad elenir. Aday yalnız herkese açık kullanıcı adı + (varsa) takipçi sayısı taşır; başka kişi verisi yoktur.
 */
import { HANDLE_PATTERN, rivalPlatformProblem } from "@/lib/domain/competitor";
import { similarSize } from "@/lib/metrics/cross-account";
import type { DiscoveryCandidate, Platform } from "@/lib/platforms/types";

/** Keşfin üst sınırları: aday seli ve beklenmedik harcama olmasın. */
export const DISCOVER_LIMITS = {
  /** Bir profilin ilgili hesaplarından en çok kaç aday yazılır. */
  related: 20,
  /** Kendi içeriklerin ortak yazarlarından en çok kaç aday yazılır. */
  coauthors: 10,
  /** Ücretli arama: en çok sorgu ve sorgu başına sonuç. */
  searchQueries: 2,
  searchPerQuery: 15,
  /** Ücretli profil bakışı: takipçisi bilinmeyen en çok kaç adaya bakılır. */
  enrich: 10,
  /** Tavan bundan az sonuca yetiyorsa ücretli koşu hiç başlatılmaz (koşu başına sabit maliyet boşa gitmesin). */
  minPaidResults: 5,
  /** Ortak yazar / arama sorgusu için okunan son kendi içerik sayısı. */
  ownContentWindow: 50,
} as const;

export interface OwnAccountRef {
  id: string;
  platform: Platform;
  handle: string;
  /** Bilinmiyorsa yok (0 değil). */
  followers?: number;
}

/** Çalışma alanında zaten kayıtlı rakip (her durumda). */
export interface KnownRival {
  id: string;
  platform: Platform;
  handle: string;
  status: string;
  source: string;
  followers?: number;
}

export interface CandidateSkips {
  /** Geçersiz / modülü olmayan platformun kullanıcı adı. */
  invalid: number;
  /** Kendi hesap. */
  own: number;
  /** Zaten kayıtlı (aday, izlenen, yoksayılan, gizli, bulunamadı). */
  known: number;
  /** Kendi hesapla aynı platformdan değil. */
  otherPlatform: number;
  /** Aynı turda tekrar geldi. */
  duplicate: number;
  /** Sınır yüzünden yazılmadı. */
  overLimit: number;
}

export interface CandidateSelection {
  fresh: DiscoveryCandidate[];
  skipped: CandidateSkips;
}

/** Platform + ham ad → normalize ad; modül yoksa ya da ad geçersizse undefined. */
export type HandleNormalizer = (platform: Platform, raw: string) => string | undefined;

const key = (platform: Platform, handle: string): string => `${platform}:${handle}`;

/** Ham adayları kurala göre süzer; sıra korunur (çağıran en değerliyi öne koyar), `limit` aşılırsa fazlası yazılmaz. */
export function selectNewCandidates(input: {
  candidates: readonly DiscoveryCandidate[];
  own: readonly Pick<OwnAccountRef, "platform" | "handle">[];
  known: readonly Pick<KnownRival, "platform" | "handle">[];
  normalize: HandleNormalizer;
  limit?: number;
}): CandidateSelection {
  const skipped: CandidateSkips = { invalid: 0, own: 0, known: 0, otherPlatform: 0, duplicate: 0, overLimit: 0 };
  const ownPlatforms = [...new Set(input.own.map((account) => account.platform))];
  const ownKeys = new Set(input.own.map((account) => key(account.platform, account.handle.toLowerCase())));
  const knownKeys = new Set(input.known.map((rival) => key(rival.platform, rival.handle.toLowerCase())));
  const seen = new Set<string>();
  const fresh: DiscoveryCandidate[] = [];

  for (const candidate of input.candidates) {
    if (rivalPlatformProblem(ownPlatforms, candidate.platform) !== undefined) {
      skipped.otherPlatform += 1;
      continue;
    }
    const handle = input.normalize(candidate.platform, candidate.handle);
    if (handle === undefined || !HANDLE_PATTERN.test(handle)) {
      skipped.invalid += 1;
      continue;
    }
    const id = key(candidate.platform, handle);
    if (ownKeys.has(id)) skipped.own += 1;
    else if (knownKeys.has(id)) skipped.known += 1;
    else if (seen.has(id)) skipped.duplicate += 1;
    else if (input.limit !== undefined && fresh.length >= input.limit) skipped.overLimit += 1;
    else {
      seen.add(id);
      // Yalnız sözleşmedeki alanlar taşınır (ham satırdan gelebilecek başka alan adaya sızmaz).
      fresh.push({
        platform: candidate.platform,
        handle,
        source: candidate.source,
        ...(candidate.followers !== undefined && Number.isFinite(candidate.followers) && candidate.followers >= 0 ? { followers: Math.trunc(candidate.followers) } : {}),
        ...(candidate.via === undefined || candidate.via.trim() === "" ? {} : { via: candidate.via.trim().slice(0, 120) }),
      });
    }
  }
  return { fresh, skipped };
}

/** Sıklığa göre sıralı tekil değerler (eşitlikte alfabetik): en sık geçen önce. */
function byFrequency(lists: readonly (readonly string[])[], clean: (value: string) => string | undefined): string[] {
  const counts = new Map<string, number>();
  for (const list of lists) {
    // Aynı içerikte iki kez geçen değer bir kez sayılır.
    for (const value of new Set(list.flatMap((raw) => clean(raw) ?? []))) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value]) => value);
}

/** Kendi içeriklerdeki ortak yazarlar: en sık birlikte paylaşılan önce, en çok `max`. */
export function rankCoauthors(lists: readonly (readonly string[])[], max: number = DISCOVER_LIMITS.coauthors): string[] {
  return byFrequency(lists, (raw) => raw.trim().replace(/^@+/, "").toLowerCase() || undefined).slice(0, max);
}

/** Konu söylemeyen, her hesapta geçen etiketler: arama sorgusu olmaz. */
const GENERIC_TAGS: ReadonlySet<string> = new Set([
  "reels", "reel", "reelsvideo", "reelsinstagram", "kesfet", "keşfet", "kesfetteyiz", "keşfetteyiz", "explore", "explorepage", "fyp", "foryou", "foryoupage",
  "viral", "trend", "trending", "video", "shorts", "love", "follow", "like", "instagood", "instadaily", "tbt", "new", "yeni",
]);

/**
 * Arama sorguları: kendi içeriklerde en sık geçen, konu söyleyen etiketler (en çok `max`). Etiket yoksa boş liste (arama yapılmaz).
 * Sorgu yalnız hesabın KENDİ herkese açık etiketlerinden gelir; kişi adı, yorum ya da rakip metni sorguya girmez.
 */
export function searchQueriesOf(hashtagLists: readonly (readonly string[])[], max: number = DISCOVER_LIMITS.searchQueries): string[] {
  const clean = (raw: string): string | undefined => {
    const tag = raw.trim().replace(/^#+/, "").toLowerCase();
    return tag.length < 4 || tag.length > 40 || /^\d+$/.test(tag) || GENERIC_TAGS.has(tag) ? undefined : tag;
  };
  return byFrequency(hashtagLists, clean).slice(0, max);
}

/**
 * Benzer boydaki (takipçi ±3 kat; `metrics/cross-account` `similarSize`) aday sayısı. Hiçbir aday karşılaştırılamadıysa (takipçi bilinmiyor,
 * aynı platformda takipçisi bilinen kendi hesap yok) undefined: "ölçülemedi", 0 değil.
 */
export function similarSizeCount(own: readonly OwnAccountRef[], candidates: readonly Pick<KnownRival, "platform" | "followers">[]): number | undefined {
  let measured = false;
  let similar = 0;
  for (const candidate of candidates) {
    const verdicts = own.filter((account) => account.platform === candidate.platform).map((account) => similarSize(account.followers, candidate.followers));
    if (verdicts.includes(true)) similar += 1;
    if (verdicts.some((verdict) => verdict !== undefined)) measured = true;
  }
  return measured ? similar : undefined;
}
