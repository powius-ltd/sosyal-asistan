/**
 * Zernio yanıt şemaları: yalnız KULLANILAN alanlar okunur (gerisi atılır; yorumcu / kitle verisi hiç ayrıştırılmaz).
 * Sayısal alanlar eksik ya da null olabilir → `undefined` (0 değil). Şema gevşektir: bir alanın tipi bozuksa o alan düşer, gönderi düşmez.
 */
import { z } from "zod";

const count = z.number().finite().nonnegative().nullish().catch(undefined);

export const zernioAnalyticsSchema = z.object({
  impressions: count,
  reach: count,
  likes: count,
  comments: count,
  shares: count,
  saves: count,
  views: count,
  /** Instagram Reels ortalama izlenme süresi (MİLİSANİYE). */
  igReelsAvgWatchTime: count,
  videoDurationSeconds: count,
  profileViews: count,
  reposts: count,
  replays: count,
  completionRate: count,
  reelsSkipRate: count,
});
export type ZernioAnalytics = z.infer<typeof zernioAnalyticsSchema>;

export const zernioPostSchema = z.object({
  content: z.string().nullish().catch(undefined),
  publishedAt: z.string().nullish().catch(undefined),
  status: z.string().nullish().catch(undefined),
  platform: z.string().nullish().catch(undefined),
  platformPostUrl: z.string().nullish().catch(undefined),
  mediaProductType: z.string().nullish().catch(undefined),
  analytics: zernioAnalyticsSchema.nullish().catch(undefined),
  platforms: z
    .array(z.object({ accountId: z.string().nullish().catch(undefined) }))
    .nullish()
    .catch(undefined),
});
export type ZernioPost = z.infer<typeof zernioPostSchema>;

export const zernioAccountSchema = z.object({
  _id: z.string(),
  platform: z.string(),
  username: z.string().nullish().catch(undefined),
  isActive: z.boolean().nullish().catch(undefined),
  followersCount: count,
});
export type ZernioAccount = z.infer<typeof zernioAccountSchema>;

export const zernioAccountsResponseSchema = z.object({ accounts: z.array(zernioAccountSchema) });

export const zernioAnalyticsResponseSchema = z.object({
  posts: z.array(zernioPostSchema),
  pagination: z.object({ pages: z.number().int().nonnegative().catch(1) }).nullish().catch(undefined),
});

/**
 * Yoklama (yayın durumu) şekli: `GET /posts` → `{ posts: [{ _id, status, scheduledFor?, publishedAt?, content, platforms: [{ platform, platformPostUrl, status }] }] }`
 * (gerçek okuma, 2026-10-20). Tek gönderi yanıtı `{ post }` ya da çıplak nesne de olabilir; üçü de aynı ayrıştırıcıdan geçer.
 * Hem gönderinin `status`'ı hem `platforms[].status` okunur; Instagram girdisi öncelikli. Yalnız adı geçen alanlar okunur (yorumcu / kitle verisi yok).
 */
const text = z.string().nullish().catch(undefined);
const platformEntrySchema = z.object({ platform: text, status: text, platformPostUrl: text, errorMessage: text });
const postStateSchema = z.object({ _id: text, status: text, scheduledFor: text, publishedAt: text, platforms: z.array(platformEntrySchema).nullish().catch(undefined) });

export interface ZernioPostState {
  postId?: string;
  /** Gönderinin genel durumu (`scheduled`, `published`, `failed`…); Zernio'nun metni aynen. */
  status?: string;
  /** Instagram girdisinin durumu / adresi / hata metni. */
  instagram?: { status?: string; permalink?: string; errorMessage?: string };
}

export function postStateOf(raw: unknown, postId?: string): ZernioPostState {
  const holder = (raw ?? {}) as { post?: unknown; posts?: unknown };
  const listed = Array.isArray(holder.posts) ? (holder.posts as { _id?: unknown }[]) : undefined;
  const candidate = listed ? (postId === undefined ? listed[0] : listed.find((p) => p?._id === postId)) : (holder.post ?? raw);
  const parsed = postStateSchema.safeParse(candidate);
  if (!parsed.success) return {};
  const instagram = parsed.data.platforms?.find((p) => p.platform === "instagram");
  return {
    ...(parsed.data._id ? { postId: parsed.data._id } : {}),
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(instagram
      ? { instagram: { ...(instagram.status ? { status: instagram.status } : {}), ...(instagram.platformPostUrl ? { permalink: instagram.platformPostUrl } : {}), ...(instagram.errorMessage ? { errorMessage: instagram.errorMessage } : {}) } }
      : {}),
  };
}
