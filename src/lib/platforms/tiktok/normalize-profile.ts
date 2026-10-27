/**
 * Apify video satırı → `NormalizedProfile` (TikTok). Ayrı profil satırı yoktur: künye her video satırının `authorMeta` alanındadır
 * (aktör veri kümesi şeması, yapı 0.0.616, 2026-10-13): `name` (kullanıcı adı), `fans`, `following`, `video`, `signature`, `verified`,
 * `privateAccount`, `bioLink`, `commerceUserInfo.{commerceUser,category}`. Canlı koşuyla DOĞRULANMADI: alanlar savunmacı okunur.
 *
 * Yalnız hesabın herkese açık künyesi: kullanıcı adı, sayılar, biyografi, doğrulama / gizlilik / işletme işareti, biyografi bağlantısı.
 * OKUNMAYANLAR: görünen ad (`nickName`), kimlik (`id`, `roomId`), fotoğraf (`avatar`, `originalAvatarUrl`), bölge, yaş işareti, beğeni
 * toplamları ve satırın video tarafı (açıklama, yorum, anılan, müzik). Ölçülemeyen alan hiç yazılmaz; `0` yalnız aktör `0` verdiyse yazılır.
 */
import { asRecord, pickBool, pickCount, pickString, type RawItem } from "@/lib/platforms/_shared/field-pick";
import { normalizedFail, normalizedOk, type Normalized } from "@/lib/platforms/_shared/not-item";
import { parseRows } from "@/lib/platforms/_shared/parse-rows";
import { readAccessError, toCommonErrorRow } from "@/lib/platforms/tiktok/error-rows";
import { normalizeHandle } from "@/lib/platforms/tiktok/handle";
import type { NormalizedProfile, ParseResult } from "@/lib/platforms/types";

export function normalizeProfile(item: RawItem): Normalized<NormalizedProfile> {
  const author = asRecord(item.authorMeta);
  if (!author) return normalizedFail("satırda hesap künyesi yok (authorMeta)");
  const handle = normalizeHandle(pickString(author, ["name"]) ?? pickString(author, ["profileUrl"]) ?? "");
  if (handle === "") return normalizedFail("profilde geçerli kullanıcı adı yok");

  const followers = pickCount(author, ["fans"]);
  const following = pickCount(author, ["following"]);
  const postsCount = pickCount(author, ["video"]);

  const profile: NormalizedProfile = {
    platform: "tiktok",
    handle,
    missingFields: [
      ...(followers === undefined ? ["followers"] : []),
      ...(following === undefined ? ["following"] : []),
      ...(postsCount === undefined ? ["postsCount"] : []),
    ],
  };
  const bio = pickString(author, ["signature"]);
  if (bio) profile.bio = bio;
  if (followers !== undefined) profile.followers = followers;
  if (following !== undefined) profile.following = following;
  if (postsCount !== undefined) profile.postsCount = postsCount;
  const isPrivate = pickBool(author, ["privateAccount"]);
  if (isPrivate !== undefined) profile.isPrivate = isPrivate;
  const isVerified = pickBool(author, ["verified"]);
  if (isVerified !== undefined) profile.isVerified = isVerified;
  const isBusiness = pickBool(author, ["commerceUserInfo.commerceUser"]);
  if (isBusiness !== undefined) profile.isBusinessAccount = isBusiness;
  const category = pickString(author, ["commerceUserInfo.category"]);
  if (category) profile.category = category;
  const externalUrl = pickString(author, ["bioLink"])?.trim();
  if (externalUrl && /^https?:\/\//i.test(externalUrl)) profile.externalUrl = externalUrl;
  return normalizedOk(profile);
}

/**
 * Dataset satırları → profiller (hesap başına TEK: aynı hesabın birden çok video satırı gelirse ilki alınır, diğerleri sessizce atlanır —
 * tekrar bir hata değildir) + öğe olmayan satırlar + erişim hatası (sonuç tümüyle boşsa).
 */
export function parseProfiles(raw: unknown[]): ParseResult<NormalizedProfile> {
  const parsed = parseRows(raw.map(toCommonErrorRow), normalizeProfile, () => readAccessError(raw));
  const seen = new Set<string>();
  const items = parsed.items.filter((profile) => (seen.has(profile.handle) ? false : (seen.add(profile.handle), true)));
  return { ...parsed, items };
}
