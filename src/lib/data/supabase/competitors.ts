/**
 * Rakipler + keşif adayları: liste, ekleme (Apify profil koşusu `reserve_budget` ile rezerve edilir) ve durum değişikliği.
 * Kullanıcı yalnız `candidate`/`tracked`/`ignored` verebilir; `private`/`not_found` toplama sonucudur (yalnız sunucu yazar).
 */
import { parseHandleInput } from "@/lib/data/handle-input";
import { rivalPlatformProblem, type Competitor, type DiscoveryCandidateView } from "@/lib/domain/competitor";
import { PLATFORMS } from "@/lib/domain/platform";
import type { AddCompetitorInput, CompetitorFilter, DiscoveryFilter, UserSettableCompetitorStatus } from "@/lib/data/queries";
import { RepositoryError } from "@/lib/data/repository";
import { isSimilarSize } from "@/lib/data/mock/mock-filters";
import { foldTurkish } from "@/lib/text";
import { withCompetitorStats } from "@/lib/data/supabase/competitor-stats";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { fetchCompetitorRows } from "@/lib/data/supabase/competitor-rows";
import { isUuid, unwrap } from "@/lib/data/supabase/errors";
import { COMPETITOR_COLUMNS, toDiscoveryView, type CompetitorRow } from "@/lib/data/supabase/mappers/accounts";
import { clampLimit } from "@/lib/data/supabase/paging";
import { rankCandidates } from "@/lib/collection/candidate-rank";
import { loadLiftStats, loadScreens } from "@/lib/collection/candidate-screen-store";
import { listOwnAccounts, requireWorkspace } from "@/lib/data/supabase/workspace";

/** Yeni rakip eklenince rezerve edilen profil koşusu tahmini (USD; mock ile aynı). */
const PROFILE_RUN_RESERVE_USD = 0.015;
const USER_STATUSES = ["candidate", "tracked", "ignored"] as const;
const SOURCES = ["manual", "related", "search"] as const;

const asArray = <T>(value: T | T[] | undefined): T[] | undefined => (value === undefined ? undefined : Array.isArray(value) ? value : [value]);

async function readCompetitorRows(ctx: SupabaseContext, wsId: string, filter: CompetitorFilter): Promise<CompetitorRow[]> {
  const rows = await fetchCompetitorRows(ctx, wsId, { platform: filter.platform, statuses: asArray(filter.status), source: filter.source });
  const search = filter.search?.trim() ? foldTurkish(filter.search.trim()) : undefined;
  return search ? rows.filter((r) => foldTurkish(`${r.handle} ${r.display_name ?? ""}`).includes(search)) : rows;
}

export async function listCompetitors(ctx: SupabaseContext, wsId: string, filter: CompetitorFilter = {}): Promise<Competitor[]> {
  if (!isUuid(wsId)) return [];
  return withCompetitorStats(ctx, wsId, await readCompetitorRows(ctx, wsId, filter));
}

export async function listDiscoveryCandidates(ctx: SupabaseContext, wsId: string, filter: DiscoveryFilter = {}): Promise<DiscoveryCandidateView[]> {
  if (!isUuid(wsId)) return [];
  const [rows, ownAccounts] = await Promise.all([
    fetchCompetitorRows(ctx, wsId, { statuses: ["candidate"], excludeSource: "manual", platform: filter.platform, source: filter.source, newestFirst: true }),
    listOwnAccounts(ctx, wsId),
  ]);
  // Sıra: niş uyumu × boyut × tutan oranı (`collection/candidate-rank`); eleme / video okunamazsa kaynak sırası (en yeni önce) sürer.
  const ownFollowers = ownAccounts.find((account) => account.platform === rows[0]?.platform)?.followers;
  const ranking = await Promise.all([loadScreens(ctx.db, wsId), loadLiftStats(ctx.db, wsId, rows.map((row) => row.id))]).then(
    ([screens, liftStats]) => rankCandidates(rows.map((row) => ({ id: row.id, handle: row.handle, ...(row.followers === null ? {} : { followers: Number(row.followers) }) })), { ownFollowers, screens, liftStats }),
    () => undefined,
  );
  const order = new Map((ranking ?? []).map((entry) => [entry.candidate.id, entry.rank]));
  const sorted = ranking === undefined ? rows : [...rows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return sorted
    .map((row) => toDiscoveryView(row, isSimilarSize(row.followers ?? undefined, row.platform, ownAccounts)))
    .filter((view) => !filter.similarSizeOnly || view.similarSize === true)
    .slice(0, clampLimit(filter.limit));
}

/**
 * Rakibi ekler: aynı platform+handle → `already_exists`; tavan aşılırsa `budget_exceeded` (rakip EKLENMEZ).
 * Sıra: rakip satırı → `reserve_budget` (Apify profil koşusu). Rezervasyon reddedilirse satır geri silinir; çok adımlı
 * işlem tek transaction olmadığı için bu telafi adımıdır (yeni rakip kısa süre listede görünebilir).
 */
export async function addCompetitor(ctx: SupabaseContext, wsId: string, input: AddCompetitorInput): Promise<Competitor> {
  await requireWorkspace(ctx, wsId);
  if (!PLATFORMS.includes(input.platform)) throw new RepositoryError("invalid_input", `Bilinmeyen platform: "${String(input.platform)}"`);
  // Rakip, kendi hesapla AYNI platformdan olur (mock ile aynı kural).
  const platformProblem = rivalPlatformProblem((await listOwnAccounts(ctx, wsId)).map((account) => account.platform), input.platform);
  if (platformProblem !== undefined) throw new RepositoryError("invalid_input", platformProblem);
  const handle = parseHandleInput(input.platform, input.handle);
  const status = input.status ?? "tracked";
  const source = input.source ?? "manual";
  if (status !== "tracked" && status !== "candidate") throw new RepositoryError("invalid_input", "Yeni rakip yalnız tracked ya da candidate olabilir.");
  if (!(SOURCES as readonly string[]).includes(source)) throw new RepositoryError("invalid_input", `Bilinmeyen kaynak: "${String(source)}"`);

  const inserted = unwrap(
    await ctx.db
      .from("competitors")
      .insert({
        workspace_id: wsId,
        platform: input.platform,
        handle,
        status,
        source,
        // Profil henüz toplanmadı: sayılar ölçülmedi (NULL, 0 değil); ilk toplamada dolar.
        missing_fields: ["followers", "following", "postsCount"],
      })
      .select(COMPETITOR_COLUMNS)
      .single(),
  );
  const reservation = await ctx.db.rpc("reserve_budget", {
    p_ws: wsId,
    p_provider: "apify",
    p_amount: PROFILE_RUN_RESERVE_USD,
    p_run: { kind: "profile", target_label: `@${handle}`, expected_results: 1 },
  });
  if (reservation.error) {
    await ctx.db.from("competitors").delete().eq("workspace_id", wsId).eq("id", inserted.id);
    unwrap(reservation);
  }
  return (await withCompetitorStats(ctx, wsId, [inserted]))[0];
}

export async function setCompetitorStatus(
  ctx: SupabaseContext,
  wsId: string,
  competitorId: string,
  status: UserSettableCompetitorStatus,
): Promise<Competitor> {
  await requireWorkspace(ctx, wsId);
  if (!(USER_STATUSES as readonly string[]).includes(status)) throw new RepositoryError("invalid_input", `Kullanıcı bu durumu veremez: ${String(status)}`);
  const current = isUuid(competitorId)
    ? unwrap(await ctx.db.from("competitors").select(COMPETITOR_COLUMNS).eq("workspace_id", wsId).eq("id", competitorId).maybeSingle())
    : null;
  if (!current) throw new RepositoryError("not_found", `Rakip bulunamadı: ${competitorId}`);
  if ((current.status === "private" || current.status === "not_found") && status !== "ignored") {
    throw new RepositoryError("invalid_state", `@${current.handle} izlenemez (${current.status}); yalnız yoksayılabilir.`);
  }
  const updated = unwrap(
    // Erişim sebebi yalnız private/not_found (ve onlardan yoksayılan) satırı açıklar; izlemeye/adaylığa dönünce bayatlar.
    await ctx.db
      .from("competitors")
      .update({ status, ...(status === "ignored" ? {} : { status_reason: null }) })
      .eq("workspace_id", wsId)
      .eq("id", competitorId)
      .select(COMPETITOR_COLUMNS)
      .maybeSingle(),
  );
  if (!updated) throw new RepositoryError("not_found", `Rakip bulunamadı: ${competitorId}`);
  return (await withCompetitorStats(ctx, wsId, [updated]))[0];
}
