/**
 * Keşfin veritabanı erişimi (yalnız sunucu, service role): kendi hesaplar, kayıtlı rakipler, kendi içeriklerin ortak yazar / etiket
 * listeleri ve ADAY yazımı. Keşif mantığı bu arayüze konuşur (`DiscoverStore`); testler bellekte sahtesini verir.
 *
 * Aday satırı YALNIZ şunları taşır: platform, kullanıcı adı, `candidate` durumu, kaynak (`related` | `search`), adayı getiren hesap / sorgu
 * ve (ölçüldüyse) profil sayıları. Ad, biyografi, fotoğraf, yorumcu / etiket / takipçi kimliği YAZILMAZ. Aday izlemeye ALINMAZ: yazım hiçbir
 * zaman `tracked` üretmez ve var olan satırı ezmez (`ignoreDuplicates`).
 */
import "server-only";

import { DISCOVER_LIMITS, type KnownRival, type OwnAccountRef } from "@/lib/collection/discover-candidates";
import type { DiscoveryCandidate } from "@/lib/platforms/types";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type CompetitorInsert = Database["public"]["Tables"]["competitors"]["Insert"];

/** Adayın ölçülen profil sayıları (yalnız BİLİNEN alanlar yazılır) ya da erişim durumu. */
export interface CandidatePatch {
  followers?: number;
  following?: number;
  postsCount?: number;
  /** Profilde ölçülemeyen alanlar. */
  missingFields?: string[];
  /** Hesap gizli / bulunamadı: aday listeden düşer (izlenemez). */
  access?: { state: "private" | "not_found"; reason: string };
}

export interface OwnContentSignals {
  /** İçerik başına ortak yazar kullanıcı adları. */
  coauthors: string[][];
  /** İçerik başına etiketler. */
  hashtags: string[][];
}

export interface DiscoverStore {
  ownAccounts(workspaceId: string): Promise<OwnAccountRef[]>;
  knownRivals(workspaceId: string): Promise<KnownRival[]>;
  ownContentSignals(workspaceId: string): Promise<OwnContentSignals>;
  /** Adayları yazar (var olan satıra dokunmaz); YENİ yazılan satır sayısı. */
  insertCandidates(workspaceId: string, candidates: readonly DiscoveryCandidate[]): Promise<number>;
  /** Yalnız hâlâ `candidate` olan satırı günceller; güncellendiyse true. */
  updateCandidate(workspaceId: string, competitorId: string, patch: CandidatePatch, capturedAt: string): Promise<boolean>;
}

const STATUS_REASON_MAX = 300;
const fail = (what: string, message: string): never => {
  throw new Error(`Keşif: ${what} (${message}).`);
};

/** Aday → `competitors` satırı. Takipçi ölçülmediyse NULL (0 değil) ve `missing_fields`'e yazılır. */
export function toCandidateRow(workspaceId: string, candidate: DiscoveryCandidate): CompetitorInsert {
  return {
    workspace_id: workspaceId,
    platform: candidate.platform,
    handle: candidate.handle,
    status: "candidate",
    source: candidate.source,
    discovered_via: candidate.via ?? null,
    followers: candidate.followers ?? null,
    missing_fields: [...(candidate.followers === undefined ? ["followers"] : []), "following", "postsCount"],
  };
}

export function createDiscoverStore(client: AdminClient): DiscoverStore {
  return {
    async ownAccounts(workspaceId) {
      const { data, error } = await client.from("social_accounts").select("id, platform, handle, followers").eq("workspace_id", workspaceId).order("created_at", { ascending: true });
      if (error) fail("kendi hesaplar okunamadı", error.message);
      return (data ?? []).map((row) => ({ id: row.id, platform: row.platform, handle: row.handle, ...(row.followers === null ? {} : { followers: row.followers }) }));
    },

    async knownRivals(workspaceId) {
      const { data, error } = await client.from("competitors").select("id, platform, handle, status, source, followers").eq("workspace_id", workspaceId).order("created_at", { ascending: true }).limit(1000);
      if (error) fail("rakipler okunamadı", error.message);
      return (data ?? []).map((row) => ({ id: row.id, platform: row.platform, handle: row.handle, status: row.status, source: row.source, ...(row.followers === null ? {} : { followers: row.followers }) }));
    },

    async ownContentSignals(workspaceId) {
      const { data, error } = await client
        .from("content_items")
        .select("coauthors, hashtags")
        .eq("workspace_id", workspaceId)
        .not("social_account_id", "is", null)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(DISCOVER_LIMITS.ownContentWindow);
      if (error) fail("kendi içerikler okunamadı", error.message);
      const rows = data ?? [];
      return { coauthors: rows.map((row) => row.coauthors ?? []), hashtags: rows.map((row) => row.hashtags ?? []) };
    },

    async insertCandidates(workspaceId, candidates) {
      if (candidates.length === 0) return 0;
      const { data, error } = await client
        .from("competitors")
        .upsert(candidates.map((candidate) => toCandidateRow(workspaceId, candidate)), { onConflict: "workspace_id,platform,handle", ignoreDuplicates: true })
        .select("id");
      if (error) fail("adaylar yazılamadı", error.message);
      return data?.length ?? 0;
    },

    async updateCandidate(workspaceId, competitorId, patch, capturedAt) {
      const update: Database["public"]["Tables"]["competitors"]["Update"] = { last_collected_at: capturedAt };
      if (patch.followers !== undefined) update.followers = patch.followers;
      if (patch.following !== undefined) update.following = patch.following;
      if (patch.postsCount !== undefined) update.posts_count = patch.postsCount;
      if (patch.missingFields !== undefined) update.missing_fields = [...patch.missingFields];
      if (patch.access !== undefined) {
        update.status = patch.access.state;
        update.status_reason = patch.access.reason.replace(/\s+/g, " ").trim().slice(0, STATUS_REASON_MAX);
      }
      const { data, error } = await client.from("competitors").update(update).eq("workspace_id", workspaceId).eq("id", competitorId).eq("status", "candidate").select("id");
      if (error) fail("aday güncellenemedi", error.message);
      return (data?.length ?? 0) > 0;
    },
  };
}
