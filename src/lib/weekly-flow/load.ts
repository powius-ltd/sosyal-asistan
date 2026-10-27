/**
 * Haftalık akışın girdisini toplar (yalnız `PanelRepository` OKUMA metotları; hepsi `readSafe`: biri düşerse yalnız o parça
 * `undefined` kalır, akış `blocked` söyler). Bugün'ün zaten okuduğu veri (`loadTodayInput`: son toplama, plan, saat dilimi)
 * YENİDEN okunmaz: `today` verilirse oradan alınır, verilmezse burada okunur.
 * Fişi olan fikirler `listStudioOrders`'tan (yalnız etkin fiş: `hata` ile biten sayılmaz); okunamazsa `undefined` (Fiş adımı `blocked`).
 */
import type { PanelRepository } from "@/lib/data/repository";
import { isActiveOrderStatus } from "@/lib/domain/studio-order";
import { weekStartOf, type WeeklyPlan } from "@/lib/domain/weekly-plan";
import { DEFAULT_TIMEZONE, toDayKey } from "@/lib/format";
import { readSafe } from "@/lib/overview/read-safe";
import type { TodayInput } from "@/lib/today/types";
import type { WeeklyFlowInput } from "@/lib/weekly-flow/types";

/** İncelenmemiş videoları saymak için okunan en çok tutan içerik. */
const PENDING_SCAN_LIMIT = 100;

export interface LoadWeeklyFlowArgs {
  repo: PanelRepository;
  wsId: string;
  now: Date;
  /** `loadTodayInput` çıktısı: verilirse plan ve son toplama yeniden okunmaz. */
  today?: Pick<TodayInput, "summary" | "workspace">;
}

const toFlowPlan = (plan: WeeklyPlan | null | undefined): WeeklyFlowInput["plan"] =>
  plan === undefined ? undefined : plan === null ? null : { weekStart: plan.weekStart, ideas: plan.items.map((i) => ({ id: i.ideaId, status: i.idea.status })) };

export async function loadWeeklyFlowInput({ repo, wsId, now, today }: LoadWeeklyFlowArgs): Promise<WeeklyFlowInput> {
  const [workspace, jobs, outliers, orders, planList, runs] = await Promise.all([
    readSafe("çalışma alanı", () => repo.getWorkspace(wsId)),
    readSafe("etkin işler", () => repo.listJobs(wsId, { active: true })),
    readSafe("incelenecek videolar", () => repo.listOutliers(wsId, { limit: PENDING_SCAN_LIMIT })),
    readSafe("fişler", () => repo.listStudioOrders(wsId, {})),
    today ? undefined : readSafe("plan listesi", () => repo.listWeeklyPlans(wsId, { limit: 1 })),
    today ? undefined : readSafe("son toplama", () => repo.listRuns(wsId, { provider: "apify", status: "ingested", limit: 1 })),
  ]);

  const timeZone = workspace?.timezone ?? today?.workspace?.timezone ?? DEFAULT_TIMEZONE;
  const currentWeekStart = today?.summary.currentWeekStart ?? weekStartOf(toDayKey(now, timeZone) ?? "") ?? "";

  let plan: WeeklyFlowInput["plan"];
  let lastCollectedAt: WeeklyFlowInput["lastCollectedAt"];
  if (today) {
    plan = toFlowPlan(today.summary.plan);
    lastCollectedAt = today.summary.lastCollectedAt ?? null;
  } else {
    const latest = planList?.[0];
    const full = latest ? await readSafe("haftalık plan", () => repo.getWeeklyPlan(wsId, latest.weekStart)) : null;
    plan = planList === undefined ? undefined : toFlowPlan(full);
    const run = runs?.items[0];
    lastCollectedAt = runs === undefined ? undefined : run ? (run.finishedAt ?? run.startedAt) : null;
  }

  return {
    now,
    lastCollectedAt,
    collectEveryDays: workspace?.collectEveryDays,
    activeJobKinds: jobs?.filter((j) => j.status === "queued" || j.status === "running").map((j) => j.kind),
    pendingAnalysis: outliers?.items.filter((c) => c.analysisStatus === undefined).length,
    currentWeekStart,
    plan,
    ticketIdeaIds: orders?.filter((o) => isActiveOrderStatus(o.status)).map((o) => o.ideaId),
  };
}
