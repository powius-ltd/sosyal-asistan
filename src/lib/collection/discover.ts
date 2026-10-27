/**
 * Rakip adayı keşfi — TEK giriş: `discoverCandidates({ client, workspaceId, maxUsd, now, log })`.
 *
 * Kaynaklar (sırayla):
 *  1. ÜCRETSİZ · ilgili hesaplar: kendi profilin "ilgili hesapları" profil toplanırken aday yazılır (`writeRelatedCandidates`, ingest kancası);
 *     burada yalnız sayılır.
 *  2. ÜCRETSİZ · ortak yazarlar: kendi içeriklerde birlikte paylaşılan hesaplar (`content_items.coauthors`; yalnız kullanıcı adı).
 *  3. ÜCRETLİ · arama: kendi içeriklerin en sık konu etiketleriyle hesap araması (sonuç takipçi sayısıyla gelir).
 *  4. ÜCRETLİ · profil bakışı: takipçisi bilinmeyen adayların profil sayıları (benzer boy bilgisi); gizli / bulunamayan aday listeden düşer.
 *
 * Kurallar: aday `candidate` yazılır, İZLEMEYE ALINMAZ · yalnız kendi hesapla AYNI platformdan · kendi hesap / kayıtlı rakip / tekrar elenir ·
 * ücretli çağrılar `maxUsd` içinde kalır (aşacaksa çağrı yapılmaz; `maxUsd` 0 ise yalnız ücretsiz kaynaklar) · platforma dallanılmaz: modül
 * arama / ilgili hesap desteklemiyorsa o kaynak boş geçer, hata vermez · bir kaynağın hatası diğerlerini durdurmaz (nota yazılır).
 * 5) ABONELİK · niş eleği + sıralama: `llm` verilmişse adaylar çalışma alanının niş özetiyle elenir (`competitor_screens`) ve sıralanır
 *    (`candidate-rank`); elek hatası keşfi DÜŞÜRMEZ (sıralama eleksiz sürer, nota yazılır). Para harcamaz.
 * Gizlilik: yalnız herkese açık kullanıcı adı + profil sayıları yazılır.
 */
import "server-only";

import { affordableCount, closePaidRun, createPaidRun, runWithinBudget, type PaidRun } from "@/lib/collection/discover-paid";
import { DISCOVER_LIMITS, rankCoauthors, searchQueriesOf, similarSizeCount, type KnownRival, type OwnAccountRef } from "@/lib/collection/discover-candidates";
import { createDiscoverStore, type CandidatePatch, type DiscoverStore } from "@/lib/collection/discover-store";
import { writeCandidates } from "@/lib/collection/discover-write";
import { screenAndRankCandidates } from "@/lib/collection/candidate-screen-run";
import { resolveProfileAccess } from "@/lib/collection/profile-rows";
import { finishIngested, noteRunError } from "@/lib/collection/run-scrape";
import type { CollectDeps, CollectSummary } from "@/lib/collection/types";
import { getPlatformModule, hasPlatformModule } from "@/lib/platforms/registry";
import type { LlmBackend } from "@/lib/llm/types";
import type { DiscoveryCandidate, PublicDataAdapter } from "@/lib/platforms/types";
import type { AdminClient } from "@/lib/supabase/admin";

export interface DiscoverOptions {
  client: AdminClient;
  workspaceId: string;
  /** Ücretli çağrıların toplam tavanı (USD). 0 = yalnız ücretsiz kaynaklar. */
  maxUsd: number;
  now: Date;
  /** Mutabakat beklemesi (ms; varsayılan 0: çağıran iş sonunda toplu mutabakat yapar). */
  reconcileWaitMs?: number;
  log?: (line: string) => void;
}

export interface SourceCount {
  /** Kaynaktan gelen ham aday sayısı. */
  found: number;
  /** Yeni yazılan aday satırı. */
  written: number;
}

export interface DiscoverSummary {
  /** completed: keşif koştu (aday çıkmasa da) · no_account: kendi hesap yok · unsupported: platform modülü yok. */
  outcome: "completed" | "no_account" | "unsupported";
  sources: {
    /** İlgili hesaplar: profil toplanırken (ya da önceki keşifte) yazılmış, hâlâ aday duran satır sayısı; bu çağrıda yeni yazım yapılmaz. */
    related: { written: number };
    coauthors: SourceCount;
    search: SourceCount & { queries: string[] };
  };
  /** Profil sayıları yazılan aday sayısı (ücretli bakış). */
  enriched: number;
  /** Bu çağrıda yeni yazılan toplam aday. */
  written: number;
  /** Keşiften gelen (elle eklenmemiş) adayların güncel özeti. `similarSize` ölçülemediyse yok (0 değil). */
  candidates: { total: number; similarSize?: number };
  cost: CollectSummary["cost"];
  notes: string[];
}

const EMPTY_COST: CollectSummary["cost"] = { reservedUsd: 0, pendingReconcile: 0 };
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : "bilinmeyen hata");
const isCandidate = (rival: KnownRival): boolean => rival.status === "candidate" && rival.source !== "manual";

function emptySummary(outcome: DiscoverSummary["outcome"], note: string): DiscoverSummary {
  return { outcome, sources: { related: { written: 0 }, coauthors: { found: 0, written: 0 }, search: { found: 0, written: 0, queries: [] } }, enriched: 0, written: 0, candidates: { total: 0 }, cost: EMPTY_COST, notes: [note] };
}

/** Ücretli arama: sorgu başına bir koşu; sonuç sayısı tavana göre küçülür. Modül aramayı desteklemiyorsa boş döner. */
async function searchCandidates(run: PaidRun, adapter: PublicDataAdapter, queries: readonly string[], notes: string[]): Promise<DiscoveryCandidate[]> {
  if (adapter.buildSearchJob === undefined || adapter.parseSearch === undefined) return [];
  const buildSearchJob = (o: { query: string; limit: number }) => adapter.buildSearchJob?.(o);
  const found: DiscoveryCandidate[] = [];
  for (const query of queries) {
    const sample = buildSearchJob({ query, limit: DISCOVER_LIMITS.searchPerQuery });
    if (sample === undefined) return found;
    const limit = await affordableCount(run, sample.actorId, DISCOVER_LIMITS.searchPerQuery, DISCOVER_LIMITS.minPaidResults);
    const spec = limit === 0 ? undefined : buildSearchJob({ query, limit });
    if (spec === undefined) {
      notes.push(`Arama "${query}": tavana sığmıyor, koşu başlatılmadı.`);
      continue;
    }
    const result = await runWithinBudget(run, { label: `arama: ${query}`, spec });
    if (!result.ok) {
      notes.push(`Arama "${query}" yapılamadı: ${result.reason}`);
      continue;
    }
    try {
      const parsed = adapter.parseSearch(result.items);
      await finishIngested(run.ctx, result.runId, { itemCount: parsed.items.length, notItems: parsed.notItems });
      found.push(...parsed.items.map((item): DiscoveryCandidate => ({ ...item, source: "search", via: item.via ?? query })));
    } catch (error) {
      const message = `Arama sonucu işlenemedi: ${messageOf(error)}`;
      notes.push(`Arama "${query}": ${message}`);
      await noteRunError(run.ctx, result.runId, message).catch(() => undefined);
    }
  }
  return found;
}

/** Ücretli profil bakışı: takipçisi bilinmeyen adaylara TEK koşu; yalnız sayılar ve erişim durumu yazılır. Güncellenen aday sayısı. */
async function enrichCandidates(run: PaidRun, adapter: PublicDataAdapter, store: DiscoverStore, targets: readonly KnownRival[], notes: string[]): Promise<number> {
  if (targets.length === 0) return 0;
  const sample = adapter.buildProfileJob(targets.slice(0, 1).map((target) => target.handle));
  const count = await affordableCount(run, sample.actorId, Math.min(targets.length, DISCOVER_LIMITS.enrich), Math.min(DISCOVER_LIMITS.minPaidResults, targets.length));
  if (count === 0) {
    notes.push("Adayların takipçi bilgisi alınmadı: tavana sığmıyor (benzer boy bilgisi eksik kalır).");
    return 0;
  }
  const batch = targets.slice(0, count);
  const spec = adapter.buildProfileJob(batch.map((target) => target.handle));
  const result = await runWithinBudget(run, { label: `aday profilleri (${batch.length} hesap)`, spec: { ...spec, kind: "discovery_related" } });
  if (!result.ok) {
    notes.push(`Aday profilleri alınamadı: ${result.reason}`);
    return 0;
  }
  try {
    const parsed = adapter.parseProfiles(result.items);
    const capturedAt = run.ctx.now.toISOString();
    let updated = 0;
    for (const target of batch) {
      const { profile, access } = resolveProfileAccess(target.handle, parsed, batch.length);
      const patch: CandidatePatch | undefined =
        access.state === "private" || access.state === "not_found"
          ? { access: { state: access.state, reason: access.reason ?? access.state } }
          : profile === undefined
            ? undefined
            : {
                ...(profile.followers === undefined ? {} : { followers: profile.followers }),
                ...(profile.following === undefined ? {} : { following: profile.following }),
                ...(profile.postsCount === undefined ? {} : { postsCount: profile.postsCount }),
                missingFields: [...profile.missingFields],
              };
      if (patch !== undefined && (await store.updateCandidate(run.ctx.workspaceId, target.id, patch, capturedAt))) updated += 1;
    }
    await finishIngested(run.ctx, result.runId, { itemCount: parsed.items.length, notItems: parsed.notItems });
    return updated;
  } catch (error) {
    const message = `Aday profilleri işlenemedi: ${messageOf(error)}`;
    notes.push(message);
    await noteRunError(run.ctx, result.runId, message).catch(() => undefined);
    return 0;
  }
}

export async function discoverCandidates(options: DiscoverOptions, depsIn: CollectDeps & { store?: DiscoverStore; llm?: LlmBackend } = {}): Promise<DiscoverSummary> {
  const { store: storeIn, llm, ...collectDeps } = depsIn;
  const store = storeIn ?? createDiscoverStore(options.client);
  const log = options.log ?? (() => undefined);
  const { workspaceId } = options;

  const own: OwnAccountRef[] = await store.ownAccounts(workspaceId);
  if (own.length === 0) return emptySummary("no_account", "Kendi hesap yok: keşif yapılmadı.");
  const platform = own[0].platform;
  if (!hasPlatformModule(platform)) return emptySummary("unsupported", `Platform modülü yok (${platform}): keşif yapılmadı.`);
  const adapter = getPlatformModule(platform).publicData;
  const notes: string[] = [];

  let known = await store.knownRivals(workspaceId);
  const signals = await store.ownContentSignals(workspaceId);
  const via = own[0].handle;

  // 2) Ortak yazarlar (ücretsiz).
  const coauthorCandidates = rankCoauthors(signals.coauthors).map((handle): DiscoveryCandidate => ({ platform, handle, source: "related", via }));
  const coauthors = await writeCandidates({ store, workspaceId, candidates: coauthorCandidates, own, known, limit: DISCOVER_LIMITS.coauthors });
  log(`Keşif · ortak yazarlar: ${coauthors.found} bulundu, ${coauthors.written} yeni aday.`);

  // 3–4) Ücretli kaynaklar: yalnız tavan verildiyse.
  const run = createPaidRun({ workspaceId, now: options.now, maxUsd: options.maxUsd, log }, { ...collectDeps, client: collectDeps.client ?? options.client });
  const search = { found: 0, written: 0, queries: [] as string[] };
  let enriched = 0;
  if (run.maxUsd > 0) {
    try {
      const queries = adapter.buildSearchJob === undefined ? [] : searchQueriesOf(signals.hashtags);
      search.queries = queries;
      if (queries.length > 0) {
        known = await store.knownRivals(workspaceId);
        const result = await writeCandidates({ store, workspaceId, candidates: await searchCandidates(run, adapter, queries, notes), own, known, limit: DISCOVER_LIMITS.searchQueries * DISCOVER_LIMITS.searchPerQuery });
        search.found = result.found;
        search.written = result.written;
        log(`Keşif · arama (${queries.join(", ")}): ${result.found} sonuç, ${result.written} yeni aday.`);
      }
      const unknownSize = (await store.knownRivals(workspaceId)).filter((rival) => isCandidate(rival) && rival.followers === undefined);
      enriched = await enrichCandidates(run, adapter, store, unknownSize, notes);
      if (enriched > 0) log(`Keşif · aday profilleri: ${enriched} adayın sayıları yazıldı.`);
    } catch (error) {
      notes.push(`Ücretli keşif yarıda kaldı: ${messageOf(error)}`);
    }
  } else {
    notes.push("Ücretli keşif (arama, aday profilleri) yapılmadı: tavan verilmedi.");
  }
  if (run.ctx.stop !== undefined) notes.push(`Ücretli keşif erken durdu: ${run.ctx.stop}.`);
  notes.push(...run.ctx.notes);

  const cost = await closePaidRun(run, options.reconcileWaitMs ?? 0);
  if (llm !== undefined) {
    try {
      const ranked = await screenAndRankCandidates({ client: options.client, llm, workspaceId, ownFollowers: own[0].followers, now: options.now, log });
      log(`Keşif · niş eleği: ${ranked.screenedNow} aday elendi, ${ranked.ranked.filter((entry) => entry.recommended).length} aday önerilir.`);
      if (ranked.note !== undefined) notes.push(ranked.note);
    } catch (error) {
      notes.push(`Aday eleği yapılamadı: ${messageOf(error)}`);
    }
  }
  const candidates = (await store.knownRivals(workspaceId)).filter(isCandidate);
  const similar = similarSizeCount(await store.ownAccounts(workspaceId), candidates);
  return {
    outcome: "completed",
    sources: { related: { written: Math.max(0, candidates.filter((rival) => rival.source === "related").length - coauthors.written) }, coauthors: { found: coauthors.found, written: coauthors.written }, search },
    enriched,
    written: coauthors.written + search.written,
    candidates: { total: candidates.length, ...(similar === undefined ? {} : { similarSize: similar }) },
    cost,
    notes,
  };
}
