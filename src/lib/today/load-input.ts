/**
 * "Bugün" girdisinin yükleyicisi: yalnız `PanelRepository` OKUMA metotları, hepsi tek dalgada (kayıt başına okuma yok). Genel bakışın
 * ek okumalarını (`loadOverviewExtras`) ve hataya dayanıklı okuma desenini (`readSafe`) yeniden kullanır: ek okumalardan biri fırlatırsa
 * yalnız o parça `undefined` kalır; çekirdek üç okuma (hesaplar, çalışma alanı, göstergeler) Genel bakıştaki gibi fırlatır.
 * Saat çağıranın `now`'ıdır; yönetici okumaları (rakip adayları) müşteri modunda hiç yapılmaz.
 */
import type { PanelRepository } from "@/lib/data/repository";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import { DEFAULT_TIMEZONE, toDayKey } from "@/lib/format";
import { loadOverviewExtras } from "@/lib/overview/load-extras";
import { readSafe } from "@/lib/overview/read-safe";
import { toSummaryInput } from "@/lib/overview/summary-input";
import type { TodayInput } from "@/lib/today/types";

/** Sözün ilk cümlesindeki dönem (gün; Genel bakışla aynı). */
export const TODAY_PERIOD_DAYS = 30;
/** Kuyruğa giren en çok yayın işi / eşleşme önerisi (fazlası ilgili sayfada). */
export const TODAY_LIST_LIMIT = 10;

export interface LoadTodayOptions {
  /** `isOperatorMode()`: çağıran (sayfa) verir. */
  operator: boolean;
}

export async function loadTodayInput(repo: PanelRepository, wsId: string, now: Date, { operator }: LoadTodayOptions): Promise<TodayInput> {
  const [accounts, workspace, overview, extras, suggestedLinks, pendingJobs, candidates] = await Promise.all([
    repo.listOwnAccounts(wsId),
    repo.getWorkspace(wsId),
    repo.getOverview(wsId, { days: TODAY_PERIOD_DAYS }),
    loadOverviewExtras({ repo, wsId, now, periodDays: TODAY_PERIOD_DAYS }),
    readSafe("eşleşme önerileri", () => repo.listIdeaLinks(wsId, { status: "suggested", limit: TODAY_LIST_LIMIT })),
    readSafe("onay bekleyen yayınlar", () => repo.listPublishJobs(wsId, { status: "awaiting_approval", limit: TODAY_LIST_LIMIT })),
    operator ? readSafe("rakip adayları", () => repo.listCompetitors(wsId, { status: "candidate" })) : undefined,
  ]);

  const timeZone = workspace?.timezone ?? DEFAULT_TIMEZONE;
  const currentWeekStart = weekStartOf(toDayKey(now, timeZone) ?? "");
  return {
    now,
    summary: toSummaryInput({ operator, accounts, overview, workspace, extras, currentWeekStart }),
    workspace,
    briefing: extras.briefing,
    suggestedLinks,
    pendingJobs,
    rivalCandidates: candidates?.length,
  };
}
