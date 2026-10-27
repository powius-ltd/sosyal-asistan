/**
 * Viral seçimi (SAF): bulunan videolardan tekilleştirme, ön süzgeç (yaş + izlenme), takipçi eksik yazar listesi ve nihai eşik.
 * Oran ölçülemezse (takipçi yok / 0) video eşikten GEÇMEZ: 0 ya da uydurma oran yazılmaz.
 */
import type { ViralVideo } from "@/lib/platforms/viral-types";
import { isViral, passesPrefilter, viralRatio } from "@/lib/viral/thresholds";

/** Bulunan video + hangi konu sorgusuyla bulunduğu. */
export interface FoundVideo extends ViralVideo {
  query: string;
}

export interface ViralItem extends FoundVideo {
  authorFollowers: number;
  viewsPerFollower: number;
}

const keyOf = (video: Pick<ViralVideo, "platform" | "externalId">): string => `${video.platform}:${video.externalId}`;

/** Aynı video birden çok sorguda gelirse İLK bulan kalır (sorgu etiketi korunur); izlenme sayısı en yeni (büyük) okumadır. */
export function dedupeFound(videos: readonly FoundVideo[]): FoundVideo[] {
  const byKey = new Map<string, FoundVideo>();
  for (const video of videos) {
    const known = byKey.get(keyOf(video));
    if (known === undefined) byKey.set(keyOf(video), { ...video });
    else if (video.views > known.views) byKey.set(keyOf(video), { ...video, query: known.query });
  }
  return [...byKey.values()];
}

/** Yaş ve izlenme eşiğini geçenler (takipçi bilinmese de): profil çağrısı yalnız bunlar için gerekir. */
export function prefilterFound(videos: readonly FoundVideo[], now: Date): FoundVideo[] {
  return videos.filter((video) => passesPrefilter(video, now));
}

/** Yazar anahtarı: kullanıcı adları platformlar arasında çakışabilir (aynı ad iki ayrı kişi olur). */
export const authorKey = (platform: string, handle: string): string => `${platform}:${handle}`;

export interface AuthorRef {
  platform: ViralVideo["platform"];
  handle: string;
  /** Yazarın bu turda bulunan en yüksek izlenmeli videosu (profil çağrısı bütçesi dar kalırsa en umut verici yazarlar önce sorgulanır). */
  bestViews: number;
}

/** Takipçisi sonuçta olmayan, ön süzgeçten geçen videoların yazarları (tekil); en yüksek izlenmeli önce. */
export function authorsNeedingFollowers(videos: readonly FoundVideo[]): AuthorRef[] {
  const byKey = new Map<string, AuthorRef>();
  for (const video of videos) {
    if (video.authorFollowers !== undefined) continue;
    const key = authorKey(video.platform, video.authorHandle);
    const known = byKey.get(key);
    if (known === undefined) byKey.set(key, { platform: video.platform, handle: video.authorHandle, bestViews: video.views });
    else known.bestViews = Math.max(known.bestViews, video.views);
  }
  return [...byKey.values()].sort((a, b) => b.bestViews - a.bestViews || a.handle.localeCompare(b.handle));
}

/** Profil çağrısından gelen takipçileri (`authorKey` → sayı) YALNIZ eksik olanlara işler; sonuçta zaten olan sayı ezilmez. */
export function applyFollowers(videos: readonly FoundVideo[], followers: ReadonlyMap<string, number>): FoundVideo[] {
  return videos.map((video) => {
    if (video.authorFollowers !== undefined) return video;
    const count = followers.get(authorKey(video.platform, video.authorHandle));
    return count === undefined ? video : { ...video, authorFollowers: count };
  });
}

/** Nihai seçim: üç eşiğin hepsi; oran büyükten küçüğe. */
export function selectViral(videos: readonly FoundVideo[], now: Date): ViralItem[] {
  const items: ViralItem[] = [];
  for (const video of videos) {
    if (!isViral(video, now) || video.authorFollowers === undefined) continue;
    const ratio = viralRatio(video.views, video.authorFollowers);
    if (ratio === undefined) continue;
    items.push({ ...video, authorFollowers: video.authorFollowers, viewsPerFollower: ratio });
  }
  return items.sort((a, b) => b.viewsPerFollower - a.viewsPerFollower || a.externalId.localeCompare(b.externalId));
}
