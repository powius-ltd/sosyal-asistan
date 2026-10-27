/**
 * `instagram-search-scraper` (`searchType: "user"`) sonucu → `DiscoveryCandidate`.
 * Arama sonucu profil biçimindedir; yalnız kullanıcı adı, takipçi sayısı ve sorgu okunur — biyografi,
 * Facebook sayfası, iletişim ve görsel alanlar taşınmaz. Gizli hesap aday DEĞİLDİR (izlenemez): `notItems`.
 */
import { pickString, type RawItem } from "@/lib/platforms/_shared/field-pick";
import { normalizedFail, normalizedOk, type Normalized } from "@/lib/platforms/_shared/not-item";
import { parseRows } from "@/lib/platforms/_shared/parse-rows";
import { readAccessError } from "@/lib/platforms/instagram/access-error";
import { normalizeProfile } from "@/lib/platforms/instagram/normalize-profile";
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

    const candidate: DiscoveryCandidate = { platform: "instagram", handle: profile.handle, source: "search" };
    if (profile.followers !== undefined) candidate.followers = profile.followers;
    const via = pickString(row, ["searchTerm"]);
    if (via) candidate.via = via;
    return normalizedOk(candidate);
  };

  return parseRows(raw, toCandidate, readAccessError);
}
