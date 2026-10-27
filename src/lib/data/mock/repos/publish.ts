/**
 * Mock depo: yayın işleri (`PanelRepository` yayın metotları). Durum makinesi kuralları `lib/domain/publish.ts`'tedir.
 */
import { isActiveOrderStatus } from "@/lib/publish/order-rows";
import { isPublishableAccount, workspaceHasZernioKey } from "@/lib/publish/publishable";
import { SCHEDULED_ON_PROVIDER_PLAIN } from "@/lib/plain-language";
import { canApprove, canCancel, canSubmit, captionLimitProblem, captionRequiredProblem, isPublishedWithinQuotaWindow, type PublishJob } from "@/lib/domain/publish";
import { assertPublishCompliant } from "@/lib/data/compliance-guard";
import { parseAdvertiserName, parseTrial, publishPlatformProblem } from "@/lib/data/publish-input";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import { filterPublishJobs } from "@/lib/data/mock/mock-filters";
import type { MockContext } from "@/lib/data/mock/repos/context";
import { MOCK_USER_ID } from "@/lib/workspace/current";

export type PublishMethods = Pick<
  PanelRepository,
  "listPublishJobs" | "createPublishJob" | "submitPublishJob" | "approvePublishJob" | "cancelPublishJob" | "getPublishSummary"
>;

/**
 * Mock'ta çalışma alanının slug'ı yoktur; Supabase ile AYNI kural (`workspaceHasZernioKey(slug)`) `MOCK_WORKSPACE_SLUG` ile işler:
 * verilmezse slug bilinmez ve (Supabase'de slug'sız çalışma alanı gibi) anahtar yok sayılır.
 */
export function mockWorkspaceHasZernioKey(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return workspaceHasZernioKey(env.MOCK_WORKSPACE_SLUG?.trim() || undefined, env);
}

export function createPublishMethods(ctx: MockContext): PublishMethods {
  const { state, clock, ws, inWs, requireWs, findOrThrow, nextId, out } = ctx;

  return {
    async listPublishJobs(wsId, filter) {
      return inWs(wsId) ? out(filterPublishJobs(state.publishJobs, filter)) : [];
    },

    async createPublishJob(wsId, input) {
      requireWs(wsId);
      const account = findOrThrow(state.ownAccounts, input.socialAccountId, "Hesap");
      const platformProblem = publishPlatformProblem(account.platform);
      if (platformProblem !== undefined) throw new RepositoryError("invalid_state", platformProblem);
      const status = input.status ?? "draft";
      if (status !== "draft" && status !== "awaiting_approval") {
        throw new RepositoryError("invalid_input", "Yeni yayın işi yalnız draft ya da awaiting_approval olabilir.");
      }
      const captionProblem =
        captionLimitProblem(input.caption) ?? (status === "awaiting_approval" ? captionRequiredProblem(input.caption) : undefined);
      if (captionProblem) throw new RepositoryError("invalid_input", captionProblem);
      if (input.scheduledFor !== undefined && Number.isNaN(new Date(input.scheduledFor).getTime())) {
        throw new RepositoryError("invalid_input", `Geçersiz planlama zamanı: ${input.scheduledFor}`);
      }
      const advertiserName = parseAdvertiserName(input.advertiserName);
      const trial = parseTrial(input.trial);
      if (input.ideaId !== undefined) findOrThrow(state.ideas, input.ideaId, "Fikir");
      if (!isPublishableAccount(account, mockWorkspaceHasZernioKey())) {
        throw new RepositoryError("invalid_state", `@${account.handle} resmi API'ye bağlı değil; yayın yalnız bağlı hesaptan yapılır.`);
      }
      const paidPartnership = input.paidPartnership ?? false;
      const aiGenerated = input.aiGenerated ?? false;
      // Doğrudan onay bekliyor açılan iş de taslaktan onaya gönderilen iş gibi uyum denetiminden geçer.
      if (status === "awaiting_approval") {
        assertPublishCompliant({ caption: input.caption, paidPartnership, aiGenerated, advertiserName }, ws.complianceRegion);
      }

      if (input.orderId && state.publishJobs.some((j) => j.workspaceId === wsId && j.orderId === input.orderId && isActiveOrderStatus(j.status))) {
        throw new RepositoryError("already_exists", "Bu sipariş için etkin bir yayın işi zaten var.");
      }
      const now = clock.tick();
      const job: PublishJob = {
        id: nextId("pj"),
        workspaceId: wsId,
        socialAccountId: account.id,
        platform: account.platform,
        ideaId: input.ideaId,
        status,
        caption: input.caption,
        mediaPath: input.mediaPath,
        coverPath: input.coverPath,
        ...(input.orderId ? { orderId: input.orderId } : {}),
        shareToFeed: input.shareToFeed ?? true,
        scheduledFor: input.scheduledFor,
        paidPartnership,
        aiGenerated,
        ...(advertiserName ? { advertiserName } : {}),
        ...(trial ? { trial } : {}),
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      state.publishJobs.push(job);
      return out(job);
    },

    async submitPublishJob(wsId, jobId) {
      requireWs(wsId);
      const job = findOrThrow(state.publishJobs, jobId, "Yayın işi");
      if (!canSubmit(job.status)) {
        throw new RepositoryError("invalid_state", `Yalnız taslak onaya gönderilebilir (şu an: ${job.status}).`);
      }
      const problem = captionRequiredProblem(job.caption);
      if (problem) throw new RepositoryError("invalid_input", problem);
      assertPublishCompliant(job, ws.complianceRegion); // fail → invalid_state; iş taslakta kalır
      job.status = "awaiting_approval";
      job.updatedAt = clock.tick();
      return out(job);
    },

    async approvePublishJob(wsId, jobId) {
      requireWs(wsId);
      const job = findOrThrow(state.publishJobs, jobId, "Yayın işi");
      if (!canApprove(job.status)) {
        throw new RepositoryError("invalid_state", `Yalnız onay bekleyen iş onaylanabilir (şu an: ${job.status}).`);
      }
      // İnsan onayı uyum `fail`'ini atlayamaz (bölge sonradan değişmiş olabilir); iş awaiting_approval'da kalır.
      assertPublishCompliant(job, ws.complianceRegion);
      job.status = "approved";
      job.approvedAt = clock.tick();
      job.approvedBy = MOCK_USER_ID; // Faz 1: oturumdaki kullanıcı
      job.updatedAt = job.approvedAt;
      return out(job);
    },

    async cancelPublishJob(wsId, jobId) {
      requireWs(wsId);
      const job = findOrThrow(state.publishJobs, jobId, "Yayın işi");
      if (!canCancel(job.status, job.containerId)) {
        throw new RepositoryError("invalid_state", job.containerId && job.status === "ready" ? SCHEDULED_ON_PROVIDER_PLAIN : `Bu durumdaki iş iptal edilemez: ${job.status}.`);
      }
      job.status = "cancelled";
      job.updatedAt = clock.tick();
      return out(job);
    },

    async getPublishSummary(wsId, now) {
      requireWs(wsId);
      const publishedLast24hByAccount: Record<string, number> = {};
      for (const job of state.publishJobs) {
        if (isPublishedWithinQuotaWindow(job, now)) {
          publishedLast24hByAccount[job.socialAccountId] = (publishedLast24hByAccount[job.socialAccountId] ?? 0) + 1;
        }
      }
      return { pendingApproval: state.publishJobs.filter((job) => canApprove(job.status)).length, publishedLast24hByAccount };
    },
  };
}
