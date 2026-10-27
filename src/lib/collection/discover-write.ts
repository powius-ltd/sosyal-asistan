/**
 * Aday yazımı: ham adaylar → kural süzgeci (`selectNewCandidates`) → `candidate` satırları. Keşfin bütün kaynakları (ilgili hesaplar, ortak
 * yazarlar, arama) AYNI yoldan yazar; aday hiçbir yolda izlemeye alınmaz.
 *
 * `writeRelatedCandidates`: profil ingest'inin kancası (`ingest-profile.ts`). Kendi hesabın profilindeki "ilgili hesaplar" her profil
 * toplamasında aday olarak yazılır (para harcamaz: veri zaten toplanmış profildedir). Kanca HİÇ fırlatmaz: aday yazımı toplamayı düşürmez.
 */
import "server-only";

import { DISCOVER_LIMITS, selectNewCandidates, type CandidateSkips, type HandleNormalizer, type KnownRival, type OwnAccountRef } from "@/lib/collection/discover-candidates";
import { createDiscoverStore, type DiscoverStore } from "@/lib/collection/discover-store";
import { getPlatformModule, hasPlatformModule } from "@/lib/platforms/registry";
import type { DiscoveryCandidate, NormalizedProfile } from "@/lib/platforms/types";
import type { ScoringOwner } from "@/lib/scoring/types";
import type { AdminClient } from "@/lib/supabase/admin";

/** Kullanıcı adını platform MODÜLÜ normalize eder (platform adıyla dallanılmaz); modül yoksa aday olamaz. */
export const moduleNormalizer: HandleNormalizer = (platform, raw) => {
  if (!hasPlatformModule(platform)) return undefined;
  const handle = getPlatformModule(platform).publicData.normalizeHandle(raw);
  return handle === "" ? undefined : handle;
};

export interface WriteCandidatesResult {
  /** Kaynaktan gelen ham aday sayısı. */
  found: number;
  /** Yeni yazılan satır sayısı. */
  written: number;
  skipped: CandidateSkips;
}

export interface WriteCandidatesInput {
  store: DiscoverStore;
  workspaceId: string;
  candidates: readonly DiscoveryCandidate[];
  own: readonly OwnAccountRef[];
  known: readonly Pick<KnownRival, "platform" | "handle">[];
  limit?: number;
  normalize?: HandleNormalizer;
}

/** Süzer ve yazar. Yazılan adaylar `known`'a eklenmez: çağıran bir sonraki kaynaktan önce listeyi kendisi genişletir. */
export async function writeCandidates(input: WriteCandidatesInput): Promise<WriteCandidatesResult & { fresh: DiscoveryCandidate[] }> {
  const { fresh, skipped } = selectNewCandidates({
    candidates: input.candidates,
    own: input.own,
    known: input.known,
    normalize: input.normalize ?? moduleNormalizer,
    limit: input.limit,
  });
  const written = await input.store.insertCandidates(input.workspaceId, fresh);
  return { found: input.candidates.length, written, skipped, fresh };
}

/** Profil ingest girdisinin kancanın baktığı kısmı. */
export interface RelatedSource {
  owner: ScoringOwner;
  profile: Pick<NormalizedProfile, "platform" | "handle" | "relatedHandles">;
}

/**
 * Kendi hesap profillerindeki ilgili hesapları aday yazar; yazılan satır sayısı. Rakip profillerinin ilgili hesapları YAZILMAZ (aday listesi
 * kullanıcının kendi çevresinden kurulur). İlgili hesap yoksa DB'ye hiç gidilmez. Hata yutulur (0 döner).
 */
export async function writeRelatedCandidates(input: { client: AdminClient; workspaceId: string; entries: readonly RelatedSource[]; store?: DiscoverStore }): Promise<number> {
  const candidates: DiscoveryCandidate[] = input.entries
    .filter((entry) => entry.owner.kind === "own")
    .flatMap(({ profile }) => (profile.relatedHandles ?? []).map((handle): DiscoveryCandidate => ({ platform: profile.platform, handle, source: "related", via: profile.handle })));
  if (candidates.length === 0) return 0;
  try {
    const store = input.store ?? createDiscoverStore(input.client);
    const [own, known] = await Promise.all([store.ownAccounts(input.workspaceId), store.knownRivals(input.workspaceId)]);
    return (await writeCandidates({ store, workspaceId: input.workspaceId, candidates, own, known, limit: DISCOVER_LIMITS.related })).written;
  } catch {
    return 0;
  }
}
