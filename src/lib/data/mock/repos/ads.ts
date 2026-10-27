/**
 * Mock depo: reklam okumaları (yalnız OKUR). Veri `generators/ads.ts` tohumudur, hesap Supabase ile AYNI fonksiyondur (`views/ads.ts`).
 * Reklam hesabı olmayan çalışma alanı yoktur: mock'taki tek çalışma alanı örnek hesaplarla gelir.
 */
import { parseAdDetailQuery, parseAdGoalPatch, parseAdReportQuery, parseAdUsageIds } from "@/lib/data/ad-schema";
import { buildMockAds } from "@/lib/data/mock/generators/ads";
import type { MockContext } from "@/lib/data/mock/repos/context";
import type { AdsRepository } from "@/lib/data/repository-ads";
import { RepositoryError } from "@/lib/data/repository";
import { adPeriodOf, buildAdDetail, buildAdReport, sortAdAccounts, type AdDataset } from "@/lib/data/views/ads";
import type { AdAccount } from "@/lib/domain/ads";
import { toDayKey } from "@/lib/format";
import { buildAdUsageFromReports } from "@/lib/matrix/ad-source";

const datasets = new WeakMap<MockContext, AdDataset>();

/** Bağlam başına TEK reklam kümesi: reklam okumaları ve Kreatif Matris aynı (hedef yazımıyla değişen) veriyi görür. */
export function mockAdDataset(ctx: MockContext): AdDataset {
  const cached = datasets.get(ctx);
  if (cached !== undefined) return cached;
  const ownContent = ctx.state.content.find((item) => item.owner.kind === "own");
  const data = buildMockAds(ctx.ws.id, toDayKey(ctx.clock.nowIso) ?? ctx.clock.nowIso.slice(0, 10), ownContent?.id);
  datasets.set(ctx, data);
  return data;
}

export function createAdsMethods(ctx: MockContext): AdsRepository {
  const { inWs, requireWs, out } = ctx;
  const data = mockAdDataset(ctx);
  return {
    async listAdAccounts(wsId) {
      return inWs(wsId) ? out(sortAdAccounts(data.accounts)) : [];
    },
    async getAdReport(wsId, query, now) {
      const valid = parseAdReportQuery(query);
      requireWs(wsId);
      const accounts = sortAdAccounts(data.accounts);
      const account = valid.accountId === undefined ? accounts[0] : accounts.find((candidate) => candidate.id === valid.accountId);
      if (valid.accountId !== undefined && account === undefined) throw new RepositoryError("not_found", `Reklam hesabı bulunamadı: ${valid.accountId}`);
      return account === undefined ? undefined : out(buildAdReport(data, account, adPeriodOf(now, valid.days)));
    },
    async getAdDetail(wsId, adId, query, now) {
      const valid = parseAdDetailQuery(query);
      requireWs(wsId);
      const detail = buildAdDetail(data, adId, adPeriodOf(now, valid.days));
      if (detail === undefined) throw new RepositoryError("not_found", `Reklam bulunamadı: ${adId}`);
      return out(detail);
    },
    async updateAdAccountGoal(wsId, patch) {
      const valid = parseAdGoalPatch(patch);
      requireWs(wsId);
      const index = data.accounts.findIndex((candidate) => candidate.id === valid.accountId);
      const current = data.accounts[index];
      if (current === undefined) throw new RepositoryError("not_found", `Reklam hesabı bulunamadı: ${valid.accountId}`);
      const next: AdAccount = { ...current, goal: valid.goal ?? undefined };
      if (valid.goal === null) delete next.goal;
      data.accounts[index] = next;
      return out(next);
    },
    async listAdUsage(wsId, contentIds, now) {
      const ids = parseAdUsageIds([...contentIds]);
      requireWs(wsId);
      return out(buildAdUsageFromReports(data, ids, now));
    },
  };
}
