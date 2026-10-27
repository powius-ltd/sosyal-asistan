/**
 * Mock depo bağlamı: tohumlu veri kümesi + saat + ortak yardımcılar. `createMockRepository` bunu bir kez kurar,
 * konuya göre ayrılmış metot grupları (`repos/*.ts`) aynı bağlamı paylaşır (durum tek: mutasyonlar birbirini görür).
 */
import type { MetricSnapshot } from "@/lib/domain/content";
import type { OnboardingStep } from "@/lib/domain/onboarding";
import { JOB_QUEUE_DEFAULT } from "@/lib/domain/panel-job";
import type { Workspace } from "@/lib/domain/run";
import { RepositoryError } from "@/lib/data/repository";
import { buildMockDataset, type MockDataset } from "@/lib/data/mock/generators/dataset";
import { createClock, type MockClock } from "@/lib/data/mock/mock-clock";
import { DEFAULT_SEED } from "@/lib/data/mock/prng";
import type { Platform } from "@/lib/platforms/types";

/** Başlangıç akışının örnek durumu ve işçisiz ilerleme; ayrıntı `repos/onboarding.ts` başlığında. */
export interface MockOnboardingOptions {
  start?: OnboardingStep;
  autoAdvance?: boolean;
  pollAdvance?: boolean;
  /** Ardışık iki ilerleme arasındaki en az gerçek süre (ms): sayfa çizimi ve yoklama sık okusa da ilerleme gözle izlenir. Verilmezse sınır yok. */
  advanceEveryMs?: number;
}

export interface MockRepositoryOptions {
  /** Verinin göreli olduğu "şimdi" (ISO). Varsayılan sabit `MOCK_NOW` (determinizm için). */
  now?: string;
  /** Yeni panel işlerinin kuyruğu (varsayılan `JOB_QUEUE_DEFAULT`). */
  jobQueue?: string;
  /** Kredi zorlaması (varsayılan kapalı): açıkken iş isteği kredi ayırır (Supabase'de `CREDITS_ENFORCED`). */
  creditsEnforced?: boolean;
  /** Başlangıç akışının örnek durumu ve işçisiz ilerleme (varsayılan: akış kapalı, ilerleme yok); bkz. `repos/onboarding.ts`. */
  onboarding?: MockOnboardingOptions;
  /** Örnek verinin tek platformlu çeşidi (ör. `tiktok`); verilmezse varsayılan veri. Bkz. `generators/platform-variant.ts`. */
  platform?: Platform;
}

/** Yeni kayıt kimliği öneki (`cp_13`, `pj_11` …); sayaç tohum veri sayısından devam eder. */
export type IdPrefix = "cp" | "run" | "pj" | "col" | "job";

export interface MockContext {
  readonly state: MockDataset;
  readonly clock: MockClock;
  /** Tek mock workspace (yazılabilir: `updateWorkspace` doğrudan bunu değiştirir). */
  readonly ws: Workspace;
  readonly snapshotsByItem: Map<string, MetricSnapshot[]>;
  /** Yeni panel işlerinin yazıldığı kuyruk. */
  readonly jobQueue: string;
  readonly creditsEnforced: boolean;
  readonly onboarding: MockOnboardingOptions;
  nextId(prefix: IdPrefix): string;
  inWs(wsId: string): boolean;
  /** Bilinmeyen workspace → `not_found`. */
  requireWs(wsId: string): void;
  findOrThrow<T extends { id: string }>(list: T[], id: string, what: string): T;
  /** Dönen nesneler kopyadır: çağıran depoyu bozamaz. */
  out<T>(value: T): T;
}

export function createMockContext(seed: number = DEFAULT_SEED, options: MockRepositoryOptions = {}): MockContext {
  const clock = createClock(options.now);
  const state = buildMockDataset(clock, seed, { platform: options.platform });
  const ws = state.workspace;

  const snapshotsByItem = new Map<string, MetricSnapshot[]>();
  for (const s of state.snapshots) {
    const list = snapshotsByItem.get(s.contentItemId);
    if (list) list.push(s);
    else snapshotsByItem.set(s.contentItemId, [s]);
  }
  for (const list of snapshotsByItem.values()) list.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  const counters: Record<IdPrefix, number> = {
    cp: state.competitors.length,
    run: state.runs.length,
    pj: state.publishJobs.length,
    col: state.collections.length,
    job: state.jobs.length,
  };

  const ctx: MockContext = {
    state,
    clock,
    ws,
    snapshotsByItem,
    jobQueue: options.jobQueue ?? JOB_QUEUE_DEFAULT,
    creditsEnforced: options.creditsEnforced ?? false,
    onboarding: options.onboarding ?? {},
    nextId: (prefix) => `${prefix}_${String(++counters[prefix]).padStart(2, "0")}`,
    inWs: (wsId) => wsId === ws.id,
    requireWs(wsId) {
      if (!ctx.inWs(wsId)) throw new RepositoryError("not_found", `Workspace bulunamadı: ${wsId}`);
    },
    findOrThrow(list, id, what) {
      const found = list.find((x) => x.id === id);
      if (!found) throw new RepositoryError("not_found", `${what} bulunamadı: ${id}`);
      return found;
    },
    out: (value) => structuredClone(value),
  };
  return ctx;
}
