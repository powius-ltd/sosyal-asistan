/**
 * Apify profil öğesi → `NormalizedProfile` (`instagram-profile-scraper`; arama aktörü de aynı biçimi verir).
 *
 * Yalnız profilin kendi künyesi okunur (biyografi bağlantısı `externalUrl` ve işletme işareti `isBusinessAccount` dahil).
 * Son gönderi listeleri (`latestPosts`, `latestIgtvVideos`) ve içlerindeki yorumcu/etiket kimlikleri okunmaz. `relatedProfiles` yalnız kullanıcı adlarına indirgenir
 * (`relatedHandles`, keşif adayı olarak); ad/kimlik/fotoğraf alanları atılır.
 * Ölçülemeyen alan hiç yazılmaz; sayaçlarda `0` yalnız aktör `0` verdiyse yazılır.
 */
import {
  asRecord,
  firstDefined,
  pickBool,
  pickCount,
  pickId,
  pickString,
  type RawItem,
} from "@/lib/platforms/_shared/field-pick";
import { normalizedFail, normalizedOk, type Normalized } from "@/lib/platforms/_shared/not-item";
import { parseRows } from "@/lib/platforms/_shared/parse-rows";
import { readAccessError } from "@/lib/platforms/instagram/access-error";
import { normalizeHandle } from "@/lib/platforms/instagram/handle";
import type { NormalizedProfile, ParseResult } from "@/lib/platforms/types";

/** Aktör kategori yokken "None" metni verebilir; bu bir kategori değildir. */
const NO_CATEGORY = /^(none|null|undefined)$/i;

/** `relatedProfiles`: `[{ username, … }]` (ya da düz metin listesi) → tekilleştirilmiş geçerli kullanıcı adları. Alan yoksa `undefined`. */
export function pickRelatedHandles(item: RawItem, ownHandle: string): string[] | undefined {
  const raw = firstDefined(item, ["relatedProfiles"]);
  if (!Array.isArray(raw)) return undefined;
  const handles = new Set<string>();
  for (const entry of raw) {
    const record = asRecord(entry);
    const name = typeof entry === "string" ? entry : record ? pickString(record, ["username", "userName"]) : undefined;
    const handle = normalizeHandle(name ?? "");
    if (handle !== "" && handle !== ownHandle) handles.add(handle);
  }
  return [...handles];
}

export function normalizeProfile(item: RawItem): Normalized<NormalizedProfile> {
  const handle = normalizeHandle(pickString(item, ["username"]) ?? pickString(item, ["url", "inputUrl"]) ?? "");
  if (handle === "") return normalizedFail("profilde geçerli kullanıcı adı yok");

  const followers = pickCount(item, ["followersCount", "followers_count", "edge_followed_by.count"]);
  const following = pickCount(item, ["followsCount", "following_count", "edge_follow.count"]);
  const postsCount = pickCount(item, ["postsCount", "posts_count", "edge_owner_to_timeline_media.count"]);

  const profile: NormalizedProfile = {
    platform: "instagram",
    handle,
    missingFields: [
      ...(followers === undefined ? ["followers"] : []),
      ...(following === undefined ? ["following"] : []),
      ...(postsCount === undefined ? ["postsCount"] : []),
    ],
  };
  const externalId = pickId(item, ["id", "pk"]);
  if (externalId) profile.externalId = externalId;
  const displayName = pickString(item, ["fullName", "full_name"]);
  if (displayName) profile.displayName = displayName;
  const bio = pickString(item, ["biography", "bio"]);
  if (bio) profile.bio = bio;
  if (followers !== undefined) profile.followers = followers;
  if (following !== undefined) profile.following = following;
  if (postsCount !== undefined) profile.postsCount = postsCount;
  const isPrivate = pickBool(item, ["private", "isPrivate", "is_private"]);
  if (isPrivate !== undefined) profile.isPrivate = isPrivate;
  const isVerified = pickBool(item, ["verified", "isVerified", "is_verified"]);
  if (isVerified !== undefined) profile.isVerified = isVerified;
  const isBusiness = pickBool(item, ["isBusinessAccount", "is_business_account"]);
  if (isBusiness !== undefined) profile.isBusinessAccount = isBusiness;
  const category = pickString(item, ["businessCategoryName", "categoryName", "category_name"]);
  if (category && !NO_CATEGORY.test(category.trim())) profile.category = category;
  const externalUrl = pickString(item, ["externalUrl", "external_url"]);
  if (externalUrl && /^https?:\/\//i.test(externalUrl.trim())) profile.externalUrl = externalUrl.trim();
  const avatar = pickString(item, ["profilePicUrlHD", "profilePicUrl", "profile_pic_url_hd", "profile_pic_url"]);
  if (avatar && /^https:\/\//i.test(avatar)) profile.avatarUrl = avatar;
  const related = pickRelatedHandles(item, handle);
  if (related) profile.relatedHandles = related;
  return normalizedOk(profile);
}

/** Dataset satırları → profiller + öğe olmayan satırlar + erişim hatası (sonuç tümüyle boşsa). */
export function parseProfiles(raw: unknown[]): ParseResult<NormalizedProfile> {
  return parseRows(raw, normalizeProfile, readAccessError);
}
