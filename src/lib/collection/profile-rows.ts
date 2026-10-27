/**
 * Saf eşleme: `NormalizedProfile` → `account_snapshots` satırı + sahip (kendi hesap / rakip) güncellemesi, ve
 * profil koşusunun sonucundan HESAP BAŞINA erişim durumu (DB'ye dokunmaz).
 *
 * Erişim durumu: profil aktörü tek koşuda birden çok hesap alır; biri gizli/bulunamaz olsa da diğerleri gelir. Bu
 * yüzden hata satırı hesap adıyla (`notItems.reason` içinde `(@ad)`) eşlenir; koşu tümüyle boşsa `accessError` (tek
 * hedefte) kullanılır. Gizli hesap bazen profil satırıyla gelir (`isPrivate: true`) — o da `private` sayılır.
 */
import "server-only";

import { toCount, ownerColumns } from "@/lib/collection/content-rows";
import type { NormalizedProfile, ParseResult } from "@/lib/platforms/types";
import type { ScoringOwner } from "@/lib/scoring/types";
import type { Database } from "@/lib/supabase/database.types";

export type AccountSnapshotRow = Database["public"]["Tables"]["account_snapshots"]["Insert"];
/** Bir hesabın profil koşusundaki durumu. `missing`: ne profil ne tanınan hata geldi (durum değişmez, raporlanır). */
export type ProfileAccessState = "ok" | "private" | "not_found" | "error" | "missing";

export interface ProfileAccess {
  handle: string;
  state: ProfileAccessState;
  /** Kısa Türkçe/kaynak sebep (rapor için); `ok` iken yok. */
  reason?: string;
}

export function toAccountSnapshotRow(
  profile: NormalizedProfile,
  owner: ScoringOwner,
  ctx: { workspaceId: string; collectionRunId: string; capturedAt: string },
): AccountSnapshotRow {
  return {
    workspace_id: ctx.workspaceId,
    platform: profile.platform,
    ...ownerColumns(owner),
    collection_run_id: ctx.collectionRunId,
    captured_at: ctx.capturedAt,
    followers: toCount(profile.followers),
    following: toCount(profile.following),
    posts_count: toCount(profile.postsCount),
    extra: {},
    source: "apify",
  };
}

export type SocialAccountPatch = Database["public"]["Tables"]["social_accounts"]["Update"];
export type CompetitorPatch = Database["public"]["Tables"]["competitors"]["Update"];

/** Ortak alanlar: yalnız BİLİNEN değerler (ölçülemeyen, mevcut değeri NULL'a ezmez). */
function knownFields(profile: NormalizedProfile) {
  const patch: {
    external_id?: string;
    display_name?: string;
    followers?: number;
    following?: number;
    posts_count?: number;
  } = {};
  if (profile.externalId !== undefined) patch.external_id = profile.externalId;
  if (profile.displayName !== undefined) patch.display_name = profile.displayName;
  const followers = toCount(profile.followers);
  if (followers !== null) patch.followers = followers;
  const following = toCount(profile.following);
  if (following !== null) patch.following = following;
  const postsCount = toCount(profile.postsCount);
  if (postsCount !== null) patch.posts_count = postsCount;
  return patch;
}

/** Kendi hesap güncellemesi: kimlik, ad, sayaçlar (son ölçümün kopyası), `last_synced_at`. */
export function toSocialAccountPatch(profile: NormalizedProfile, capturedAt: string): SocialAccountPatch {
  return { ...knownFields(profile), last_synced_at: capturedAt };
}

/**
 * Rakip güncellemesi: ortak alanlar + biyografi, doğrulama, kategori, eksik alanlar, `last_collected_at`.
 * Avatar adresi yazılmaz (süreli CDN bağlantısı).
 */
export function toCompetitorPatch(profile: NormalizedProfile, capturedAt: string): CompetitorPatch {
  const patch: CompetitorPatch = { ...knownFields(profile) };
  if (profile.bio !== undefined) patch.bio = profile.bio;
  if (profile.isVerified !== undefined) patch.is_verified = profile.isVerified;
  if (profile.category !== undefined) patch.category = profile.category;
  // Profil açıkça okundu (gizli değil): önceki erişim hatasının sebebi bayatladı (durumu geri açmak kullanıcı kararıdır).
  // Gizli profil satırıyla geldiyse sebep KALIR: `markCompetitorAccess` az önce yazdı.
  if (profile.isPrivate !== true) patch.status_reason = null;
  patch.missing_fields = [...profile.missingFields];
  patch.last_collected_at = capturedAt;
  return patch;
}

/** Hata metninden erişim sınıfı (`access-error.ts` ile aynı sınıflar; burada satır değil sebep metni okunur). */
export function classifyAccessReason(reason: string): "private" | "not_found" | undefined {
  const text = reason.toLowerCase();
  if (/private|restricted/.test(text)) return "private";
  if (/not_found|not found|does not exist|no such|no_items|empty/.test(text)) return "not_found";
  return undefined;
}

function reasonMentions(reason: string, handle: string): boolean {
  return reason.toLowerCase().includes(`(@${handle})`);
}

/**
 * Hedef hesabın profil koşusundaki durumu ve (varsa) profili.
 * Hedef adı, profilin `handle`'ıyla küçük harfe indirilerek eşlenir (ikisi de `normalizeHandle` çıktısıdır).
 */
export function resolveProfileAccess(
  handle: string,
  parsed: ParseResult<NormalizedProfile>,
  totalTargets: number,
): { profile?: NormalizedProfile; access: ProfileAccess } {
  const key = handle.toLowerCase();
  const profile = parsed.items.find((item) => item.handle.toLowerCase() === key);
  if (profile) {
    if (profile.isPrivate === true) return { profile, access: { handle, state: "private", reason: "hesap gizli" } };
    return { profile, access: { handle, state: "ok" } };
  }

  const mentioned = parsed.notItems.find((entry) => reasonMentions(entry.reason, key));
  if (mentioned) {
    const state = classifyAccessReason(mentioned.reason);
    return { access: { handle, state: state ?? "error", reason: mentioned.reason } };
  }
  // Tek hedefli koşu tümüyle boş döndü: koşu düzeyindeki erişim hatası bu hesaba aittir.
  if (parsed.accessError && totalTargets === 1) {
    const state = classifyAccessReason(parsed.accessError);
    return { access: { handle, state: state ?? "error", reason: parsed.accessError } };
  }
  return { access: { handle, state: "missing", reason: "profil koşusunda bu hesap için veri gelmedi" } };
}
