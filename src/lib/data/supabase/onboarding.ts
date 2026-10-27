/**
 * Başlangıç akışı (Supabase): `getOnboardingState`, `startOnboardingProbe`, `confirmOnboardingAccount`, `startOnboardingBuild`,
 * `discardOnboardingWorkspace`, `addOnboardingRival`. Durum
 * saklanmaz: çalışma alanı satırı (`account_confirmed_at`), kendi hesaplar, başlangıç işleri, rakip sayıları, plan / içerik varlığı okunur ve
 * mock ile AYNI fonksiyonla (`buildOnboardingState`) adıma çevrilir. Her okuma açıkça `workspace_id` süzgeçlidir.
 *
 * İşler `requestJob` yolundan açılır (onay sunucuda, aşamanın sabit tavanı; kredi zorlaması açıksa ayırma iş satırıyla atomik). DB kuralları
 * (migration 0021): deneme sınırı ve "bakış bitmeden ilk tur yok" trigger'da, hesap başına tek ilk tur kısmi benzersiz indekste; hataları
 * `errors.ts` çevirir. "Başlat" iki adımdır (iş → izleme) ve tek transaction değildir: izleme yazılamazsa iş iptal edilir (telafi adımı).
 */
import { parseAddOnboardingRival, parseConfirmOnboardingAccount, parseStartOnboardingBuild } from "@/lib/data/onboarding-input";
import { RepositoryError } from "@/lib/data/repository";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { isUuid, unwrap } from "@/lib/data/supabase/errors";
import { cancelJob, requestJob } from "@/lib/data/supabase/jobs";
import { isoOpt } from "@/lib/data/supabase/mappers/common";
import { competitorStatusOf } from "@/lib/data/supabase/mappers/enums";
import { JOB_COLUMNS, toPanelJob } from "@/lib/data/supabase/mappers/job";
import type { SupabaseMethod } from "@/lib/data/supabase/not-implemented";
import { listOwnAccounts, requireWorkspace } from "@/lib/data/supabase/workspace";
import { withCompetitorStats } from "@/lib/data/supabase/competitor-stats";
import { COMPETITOR_COLUMNS } from "@/lib/data/supabase/mappers/accounts";
import { assertOnboardingAction, buildOnboardingState, normalizeRivalHandle, ONBOARDING_ERROR, rivalsToTrack } from "@/lib/data/views/onboarding";
import type { OnboardingState } from "@/lib/domain/onboarding";
import type { Platform } from "@/lib/platforms/types";
import { hasPlatformModule } from "@/lib/platforms/registry";

/** Bir çalışma alanında okunan en çok başlangıç işi (deneme sınırları toplamının çok üstünde). */
const ONBOARDING_JOBS_LIMIT = 50;

async function countRows(query: PromiseLike<{ count: number | null; error: Parameters<typeof unwrap>[0]["error"] }>): Promise<number> {
  const { count, error } = await query;
  unwrap({ data: null, error });
  return count ?? 0;
}

async function readState(ctx: SupabaseContext, wsId: string): Promise<OnboardingState> {
  const workspace = await requireWorkspace(ctx, wsId);
  const ownAccounts = await listOwnAccounts(ctx, wsId);
  const platform: Platform | undefined = ownAccounts[0]?.platform;
  const rivals = (status: "candidate" | "tracked") => {
    const query = ctx.db.from("competitors").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", status);
    return countRows(platform === undefined ? query : query.eq("platform", platform));
  };
  const [confirmed, jobRows, candidateCount, trackedCount, planCount, contentCount] = await Promise.all([
    // `account_confirmed_at` (0021) yalnız burada okunur: ortak workspace sütun listesine girmez (akış dışındaki okumalar ona bağlı değildir).
    ctx.db.from("workspaces").select("account_confirmed_at").eq("id", wsId).maybeSingle(),
    ctx.db.from("panel_jobs").select(JOB_COLUMNS).eq("workspace_id", wsId).eq("kind", "onboarding").order("created_at", { ascending: false }).limit(ONBOARDING_JOBS_LIMIT),
    rivals("candidate"),
    rivals("tracked"),
    countRows(ctx.db.from("weekly_plans").select("id", { count: "exact", head: true }).eq("workspace_id", wsId)),
    countRows(ctx.db.from("content_items").select("id", { count: "exact", head: true }).eq("workspace_id", wsId)),
  ]);
  const accountConfirmedAt = isoOpt(unwrap(confirmed)?.account_confirmed_at ?? null);
  return buildOnboardingState({
    workspace,
    ...(accountConfirmedAt === undefined ? {} : { accountConfirmedAt }),
    ownAccounts,
    jobs: unwrap(jobRows).flatMap((row) => toPanelJob(row) ?? []),
    candidateCount,
    trackedCount,
    hasPlan: planCount > 0,
    hasContent: contentCount > 0,
  });
}

export const getOnboardingState: SupabaseMethod<"getOnboardingState"> = (ctx, wsId) => readState(ctx, wsId);

export const startOnboardingProbe: SupabaseMethod<"startOnboardingProbe"> = async (ctx, wsId) => {
  const current = await readState(ctx, wsId);
  assertOnboardingAction(current, "start_probe");
  if (current.account === undefined || !hasPlatformModule(current.account.platform)) throw new RepositoryError("invalid_state", ONBOARDING_ERROR.noModule);
  return requestJob(ctx, wsId, { kind: "onboarding", phase: "probe" });
};

export const confirmOnboardingAccount: SupabaseMethod<"confirmOnboardingAccount"> = async (ctx, wsId, input) => {
  const valid = parseConfirmOnboardingAccount(input);
  assertOnboardingAction(await readState(ctx, wsId), "confirm_account");
  const updated = unwrap(
    await ctx.db
      .from("workspaces")
      .update({
        account_type: valid.accountType,
        account_confirmed_at: ctx.now().toISOString(),
        ...(valid.nicheBrief === undefined ? {} : { niche_brief: valid.nicheBrief === "" ? null : valid.nicheBrief }),
      })
      .eq("id", wsId)
      .select("id")
      .maybeSingle(),
  );
  if (!updated) throw new RepositoryError("not_found", `Workspace bulunamadı: ${wsId}`);
  return readState(ctx, wsId);
};

/**
 * Elle eklenen rakip adayı: yalnız satır yazar (`candidate`, `manual`), Apify rezervi YOK. (`addCompetitor` profil koşusu ayırır; aday için
 * gerekmez: profil sayıları ilk tur sırasında gelir. `competitors.ts`'e dokunulmaz.) Aynı hesap → benzersiz indeks → `already_exists`.
 */
export const addOnboardingRival: SupabaseMethod<"addOnboardingRival"> = async (ctx, wsId, input) => {
  const { handle: raw } = parseAddOnboardingRival(input);
  const current = await readState(ctx, wsId);
  assertOnboardingAction(current, "start_build");
  const platform = current.account?.platform;
  if (platform === undefined) throw new RepositoryError("invalid_state", ONBOARDING_ERROR.noModule);
  const handle = normalizeRivalHandle(raw);
  const inserted = unwrap(
    await ctx.db
      .from("competitors")
      .insert({
        workspace_id: wsId,
        platform,
        handle,
        status: "candidate",
        source: "manual",
        // Profil henüz toplanmadı: sayılar ölçülmedi (NULL, 0 değil); ilk turda dolar.
        missing_fields: ["followers", "following", "postsCount"],
      })
      .select(COMPETITOR_COLUMNS)
      .single(),
  );
  return (await withCompetitorStats(ctx, wsId, [inserted]))[0];
};

export const discardOnboardingWorkspace: SupabaseMethod<"discardOnboardingWorkspace"> = async (ctx, wsId) => {
  if (!isUuid(wsId)) throw new RepositoryError("not_found", "Workspace bulunamadı.");
  // Kural DB'dedir (0022): onaylanmamış, ilk turu açılmamış, gerçek veri taşımayan çalışma alanı; sahibi `approverUserId`.
  unwrap(await ctx.db.rpc("discard_unconfirmed_workspace", { p_user: ctx.approverUserId, p_ws: wsId }));
};

export const startOnboardingBuild: SupabaseMethod<"startOnboardingBuild"> = async (ctx, wsId, input) => {
  const { rivalIds } = parseStartOnboardingBuild(input);
  const current = await readState(ctx, wsId);
  assertOnboardingAction(current, "start_build");
  if (current.account === undefined) throw new RepositoryError("invalid_state", ONBOARDING_ERROR.noModule);
  const wanted = rivalIds.filter(isUuid);
  const rows = wanted.length === 0 ? [] : unwrap(await ctx.db.from("competitors").select("id, platform, status, handle").eq("workspace_id", wsId).in("id", wanted));
  // Biçimsiz kimlik sorguya gitmez; listede bulunamadığı için `rivalsToTrack` `invalid_input` verir.
  const toTrack = rivalsToTrack(rows.map((row) => ({ ...row, status: competitorStatusOf(row.status) })), rivalIds, current.account.platform);

  // Önce iş (onay kaydı), sonra izleme: iş yazılamazsa hiçbir rakip izlemeye alınmaz. İzleme yazılamazsa iş iptal edilir (telafi).
  const job = await requestJob(ctx, wsId, { kind: "onboarding", phase: "build", ...(rivalIds.length === 0 ? {} : { rivalIds }) });
  if (toTrack.length > 0) {
    const tracked = await ctx.db.from("competitors").update({ status: "tracked", status_reason: null }).eq("workspace_id", wsId).eq("status", "candidate").in("id", toTrack);
    if (tracked.error) {
      await cancelJob(ctx, wsId, job.id).catch(() => undefined);
      unwrap(tracked);
    }
  }
  return job;
};
