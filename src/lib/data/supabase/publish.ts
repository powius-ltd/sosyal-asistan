/**
 * Yayın işleri. İNSAN ONAYI kuralı üç katmanda: (1) burada TS uyum denetimi (`compliance-guard`: onaya gönderme, onay ve
 * doğrudan onay-bekliyor açma; `fail` → `ComplianceFailedError`), (2) service-role yazımı (durum ilerletme yalnız
 * sunucuda), (3) DB check + trigger (`publish_jobs_guard`; onay yalnız `awaiting_approval → approved`, onaylayan editör/sahip
 * üye). Yazımlar iyimser eşzamanlıdır (`eq("status", okunan)`): iki yarışan çağrıdan yalnız biri geçer.
 * Faz 1: onaylayan = `LOCAL_USER_ID` (yerel tek kullanıcı, seed'de sahip).
 */
import { isPublishableAccount, workspaceHasZernioKey } from "@/lib/publish/publishable";
import {
  canApprove,
  canCancel,
  canSubmit,
  captionLimitProblem,
  captionRequiredProblem,
  isPublishedWithinQuotaWindow,
  PUBLISH_QUOTA_WINDOW_MS,
  type PublishJob,
  type PublishSummary,
} from "@/lib/domain/publish";
import type { CreatePublishJobInput, PublishJobFilter } from "@/lib/data/queries";
import { assertPublishCompliant } from "@/lib/data/compliance-guard";
import { parseAdvertiserName, parseTrial, publishPlatformProblem } from "@/lib/data/publish-input";
import { RepositoryError } from "@/lib/data/repository";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { assertIsoInstant, isUuid, unwrap } from "@/lib/data/supabase/errors";
import { PUBLISH_COLUMNS, toPublishJob, type PublishRow } from "@/lib/data/supabase/mappers/publish";
import { clampLimit } from "@/lib/data/supabase/paging";
import { requireWorkspace } from "@/lib/data/supabase/workspace";
import { SCHEDULED_ON_PROVIDER_PLAIN } from "@/lib/plain-language";

const asArray = <T>(value: T | T[] | undefined): T[] | undefined => (value === undefined ? undefined : Array.isArray(value) ? value : [value]);
const timeOf = (iso: string) => new Date(iso).getTime();

/** Takvim anahtarı: planlanan zaman, yoksa oluşturma zamanı (`coalesce(scheduled_at, created_at)`). */
const jobKey = (row: PublishRow) => timeOf(row.scheduled_at ?? row.created_at);

/**
 * Yeniden eskiye (takvim anahtarı). PostgREST `coalesce` ile sıralayamaz: planlı ve plansız işler iki akım olarak
 * (her biri kendi sütununda sıralı, `limit`'li) okunur ve birleştirilir — ilk `limit` satır tam olarak doğrudur.
 */
export async function listPublishJobs(ctx: SupabaseContext, wsId: string, filter: PublishJobFilter = {}): Promise<PublishJob[]> {
  if (!isUuid(wsId) || (filter.socialAccountId !== undefined && !isUuid(filter.socialAccountId))) return [];
  assertIsoInstant(filter.from, "başlangıç zamanı");
  assertIsoInstant(filter.to, "bitiş zamanı");
  const limit = clampLimit(filter.limit);
  const statuses = asArray(filter.status);

  async function stream(scheduled: boolean): Promise<PublishRow[]> {
    const key = scheduled ? "scheduled_at" : "created_at";
    let query = ctx.db.from("publish_jobs").select(PUBLISH_COLUMNS).eq("workspace_id", wsId);
    query = scheduled ? query.not("scheduled_at", "is", null) : query.is("scheduled_at", null);
    if (statuses) query = query.in("status", statuses);
    if (filter.socialAccountId) query = query.eq("social_account_id", filter.socialAccountId);
    if (filter.from) query = query.gte(key, filter.from);
    if (filter.to) query = query.lte(key, filter.to);
    return unwrap(await query.order(key, { ascending: false }).order("id", { ascending: true }).limit(limit));
  }

  const [scheduled, unscheduled] = await Promise.all([stream(true), stream(false)]);
  return [...scheduled, ...unscheduled]
    .sort((a, b) => jobKey(b) - jobKey(a) || (a.id < b.id ? -1 : 1))
    .slice(0, limit)
    .map(toPublishJob);
}

async function readJob(ctx: SupabaseContext, wsId: string, jobId: string): Promise<PublishRow> {
  const row = isUuid(jobId)
    ? unwrap(await ctx.db.from("publish_jobs").select(PUBLISH_COLUMNS).eq("workspace_id", wsId).eq("id", jobId).maybeSingle())
    : null;
  if (!row) throw new RepositoryError("not_found", `Yayın işi bulunamadı: ${jobId}`);
  return row;
}

export async function createPublishJob(ctx: SupabaseContext, wsId: string, input: CreatePublishJobInput): Promise<PublishJob> {
  const workspace = await requireWorkspace(ctx, wsId);
  const account = isUuid(input.socialAccountId)
    ? unwrap(await ctx.db.from("social_accounts").select("id, platform, handle, connection").eq("workspace_id", wsId).eq("id", input.socialAccountId).maybeSingle())
    : null;
  if (!account) throw new RepositoryError("not_found", `Hesap bulunamadı: ${input.socialAccountId}`);
  const platformProblem = publishPlatformProblem(account.platform);
  if (platformProblem !== undefined) throw new RepositoryError("invalid_state", platformProblem);

  const status = input.status ?? "draft";
  if (status !== "draft" && status !== "awaiting_approval") {
    throw new RepositoryError("invalid_input", "Yeni yayın işi yalnız draft ya da awaiting_approval olabilir.");
  }
  const caption = typeof input.caption === "string" ? input.caption : undefined;
  const captionProblem = captionLimitProblem(caption) ?? (status === "awaiting_approval" ? captionRequiredProblem(caption) : undefined);
  if (captionProblem) throw new RepositoryError("invalid_input", captionProblem);
  assertIsoInstant(input.scheduledFor, "planlama zamanı");
  const advertiserName = parseAdvertiserName(input.advertiserName);
  const trial = parseTrial(input.trial);
  if (input.ideaId !== undefined) {
    const idea = isUuid(input.ideaId) ? unwrap(await ctx.db.from("ideas").select("id").eq("workspace_id", wsId).eq("id", input.ideaId).maybeSingle()) : null;
    if (!idea) throw new RepositoryError("not_found", `Fikir bulunamadı: ${input.ideaId}`);
  }
  const slugRow = input.orderId === undefined && account.connection === "connected" ? undefined : unwrap(await ctx.db.from("workspaces").select("slug").eq("id", wsId).maybeSingle());
  if (!isPublishableAccount(account, workspaceHasZernioKey(slugRow?.slug ?? undefined))) {
    throw new RepositoryError("invalid_state", `@${account.handle} resmi API'ye bağlı değil; yayın yalnız bağlı hesaptan yapılır.`);
  }
  const paidPartnership = input.paidPartnership ?? false;
  const aiGenerated = input.aiGenerated ?? false;
  // Doğrudan onay bekliyor açılan iş de taslaktan onaya gönderilen iş gibi uyum denetiminden geçer.
  if (status === "awaiting_approval") assertPublishCompliant({ caption, paidPartnership, aiGenerated, advertiserName }, workspace.complianceRegion);

  const row = unwrap(
    await ctx.db
      .from("publish_jobs")
      .insert({
        workspace_id: wsId,
        social_account_id: account.id,
        platform: account.platform,
        idea_id: input.ideaId ?? null,
        status,
        caption: caption ?? null,
        media_path: input.mediaPath ?? null,
        cover_path: input.coverPath ?? null,
        order_id: input.orderId ?? null,
        share_to_feed: input.shareToFeed ?? true,
        scheduled_at: input.scheduledFor ?? null,
        paid_partnership: paidPartnership,
        ai_generated: aiGenerated,
        advertiser_name: advertiserName ?? null,
        trial_enabled: trial?.enabled ?? false,
        trial_graduation: trial?.graduation ?? null,
      })
      .select(PUBLISH_COLUMNS)
      .single(),
  );
  return toPublishJob(row);
}

/** Durum geçişini iyimser eşzamanlılıkla yazar: iş okunduğu andaki durumdaysa güncellenir, değilse `invalid_state`. */
async function transition(
  ctx: SupabaseContext,
  wsId: string,
  job: PublishRow,
  columns: Partial<Pick<PublishRow, "status" | "approved_by" | "approved_at">>,
): Promise<PublishJob> {
  const row = unwrap(
    await ctx.db.from("publish_jobs").update(columns).eq("workspace_id", wsId).eq("id", job.id).eq("status", job.status).select(PUBLISH_COLUMNS).maybeSingle(),
  );
  if (!row) throw new RepositoryError("invalid_state", "Yayın işi bu sırada başka biri tarafından değiştirildi; yenile.");
  return toPublishJob(row);
}

/** Taslağı onaya gönderir (bir onay DEĞİLDİR): YALNIZ `draft`; açıklama zorunlu; uyum `fail` engeller. */
export async function submitPublishJob(ctx: SupabaseContext, wsId: string, jobId: string): Promise<PublishJob> {
  const workspace = await requireWorkspace(ctx, wsId);
  const job = await readJob(ctx, wsId, jobId);
  const current = toPublishJob(job);
  if (!canSubmit(current.status)) throw new RepositoryError("invalid_state", `Yalnız taslak onaya gönderilebilir (şu an: ${current.status}).`);
  const problem = captionRequiredProblem(current.caption);
  if (problem) throw new RepositoryError("invalid_input", problem);
  assertPublishCompliant(current, workspace.complianceRegion); // fail → invalid_state; iş taslakta kalır
  return transition(ctx, wsId, job, { status: "awaiting_approval" });
}

/** İnsan onayı: YALNIZ `awaiting_approval → approved`; onaylayan + an birlikte yazılır; uyum `fail` onayı da engeller. */
export async function approvePublishJob(ctx: SupabaseContext, wsId: string, jobId: string): Promise<PublishJob> {
  const workspace = await requireWorkspace(ctx, wsId);
  const job = await readJob(ctx, wsId, jobId);
  const current = toPublishJob(job);
  if (!canApprove(current.status)) throw new RepositoryError("invalid_state", `Yalnız onay bekleyen iş onaylanabilir (şu an: ${current.status}).`);
  // Bölge sonradan değişmiş olabilir: onay anında uyum yeniden denetlenir; iş awaiting_approval'da kalır.
  assertPublishCompliant(current, workspace.complianceRegion);
  return transition(ctx, wsId, job, { status: "approved", approved_by: ctx.approverUserId, approved_at: ctx.now().toISOString() });
}

export async function cancelPublishJob(ctx: SupabaseContext, wsId: string, jobId: string): Promise<PublishJob> {
  await requireWorkspace(ctx, wsId);
  const job = await readJob(ctx, wsId, jobId);
  const current = toPublishJob(job);
  if (!canCancel(current.status, current.containerId)) {
    throw new RepositoryError("invalid_state", current.containerId && current.status === "ready" ? SCHEDULED_ON_PROVIDER_PLAIN : `Bu durumdaki iş iptal edilemez: ${current.status}.`);
  }
  return transition(ctx, wsId, job, { status: "cancelled" });
}

/**
 * Onay bekleyen sayısı + hesap başına son 24 saatte yayınlanan iş sayısı (sayım depoda; liste limitine bağlı değil).
 * Pencere `(now − 24s, now]`; yayın anı yerine son güncelleme zamanı (`updated_at`). DB mikrosaniye, domain milisaniye
 * tutar: SQL biraz geniş aralıkla daraltır, kesin karar `isPublishedWithinQuotaWindow` ile (tek yerde) verilir.
 */
export async function getPublishSummary(ctx: SupabaseContext, wsId: string, now: Date): Promise<PublishSummary> {
  await requireWorkspace(ctx, wsId);
  const slack = 1000;
  const from = new Date(now.getTime() - PUBLISH_QUOTA_WINDOW_MS - slack).toISOString();
  const to = new Date(now.getTime() + slack).toISOString();
  const [pending, published] = await Promise.all([
    ctx.db.from("publish_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).eq("status", "awaiting_approval"),
    ctx.db.from("publish_jobs").select("social_account_id, updated_at").eq("workspace_id", wsId).eq("status", "published").gt("updated_at", from).lte("updated_at", to),
  ]);
  if (pending.error) unwrap(pending);
  const publishedLast24hByAccount: Record<string, number> = {};
  for (const row of unwrap(published)) {
    if (!isPublishedWithinQuotaWindow({ status: "published", updatedAt: new Date(row.updated_at).toISOString() }, now)) continue;
    publishedLast24hByAccount[row.social_account_id] = (publishedLast24hByAccount[row.social_account_id] ?? 0) + 1;
  }
  return { pendingApproval: pending.count ?? 0, publishedLast24hByAccount };
}
