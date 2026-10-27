/**
 * Hesap araması sonucu (`clockworks/tiktok-scraper`, `searchQueries`) → `DiscoveryCandidate`.
 * Satırlar video biçimindedir; yazar künyesi `authorMeta`'dadır. Yalnız herkese açık kullanıcı adı ve takipçi sayısı okunur
 * (künye `normalizeProfile` ile okunur: yorumcu, anılan, müzik sahibi, görünen ad, fotoğraf, kimlik ASLA taşınmaz). Gizli hesap aday DEĞİLDİR.
 * Yazar başına tek aday; takipçi bilinmiyorsa `followers` alanı hiç yazılmaz (0 değil).
 */
import type { RawItem } from "@/lib/platforms/_shared/field-pick";
import { normalizedFail, normalizedOk, type Normalized } from "@/lib/platforms/_shared/not-item";
import { parseRows } from "@/lib/platforms/_shared/parse-rows";
import { readAccessError, toCommonErrorRow } from "@/lib/platforms/tiktok/error-rows";
import { normalizeProfile } from "@/lib/platforms/tiktok/normalize-profile";
import type { DiscoveryCandidate, ParseResult } from "@/lib/platforms/types";

export function parseSearch(raw: unknown[]): ParseResult<DiscoveryCandidate> {
  const seen = new Set<string>();

  const toCandidate = (row: RawItem): Normalized<DiscoveryCandidate> => {
    const result = normalizeProfile(row);
    if (!result.ok) return normalizedFail(result.reason);
    const profile = result.value;
    if (profile.isPrivate === true) return normalizedFail(`hesap gizli, aday olamaz (@${profile.handle})`);
    if (seen.has(profile.handle)) return normalizedFail(`aynı hesap tekrar geldi (@${profile.handle})`);
    seen.add(profile.handle);
    const candidate: DiscoveryCandidate = { platform: "tiktok", handle: profile.handle, source: "search" };
    if (profile.followers !== undefined) candidate.followers = profile.followers;
    return normalizedOk(candidate);
  };

  return parseRows(raw.map(toCommonErrorRow), toCandidate, () => readAccessError(raw));
}
