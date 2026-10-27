/**
 * Keşif testleri için ortak kurucular (yalnız testler içe aktarır): bellekte `DiscoverStore` ve SAHTE Apify bağımlılıkları. Ağ yok, para
 * harcanmaz; her başlatılan koşu casusla sayılır.
 */
import { vi } from "vitest";

import type { BudgetedRun, BudgetedRunRequest } from "@/lib/apify/start";
import type { KnownRival, OwnAccountRef } from "@/lib/collection/discover-candidates";
import { toCandidateRow, type CandidatePatch, type DiscoverStore } from "@/lib/collection/discover-store";
import type { CollectDeps } from "@/lib/collection/types";
import type { AdminClient } from "@/lib/supabase/admin";

export const WS = "7a3f0000-0000-4000-8000-0000000000d2";
export const NOW = new Date("2026-10-13T09:00:00Z");

/** Her zincir çağrısı kendine döner; await edilince boş, hatasız sonuç verir (yazımlar no-op). */
export function fakeClient(): AdminClient {
  const chain: unknown = new Proxy(function noop() {}, {
    get: (_target, prop) => (prop === "then" ? (resolve: (value: unknown) => void) => resolve({ data: [], error: null }) : () => chain),
    apply: () => chain,
  });
  return { from: () => chain, rpc: () => chain } as unknown as AdminClient;
}

export interface MemoryStore extends DiscoverStore {
  rivals: KnownRival[];
  /** `competitors`'a yazılan HAM satırlar (gizlilik testi alan adlarına bakar). */
  insertedRows: Record<string, unknown>[];
  patches: { id: string; patch: CandidatePatch }[];
}

export function memoryStore(seed: { own?: OwnAccountRef[]; rivals?: KnownRival[]; coauthors?: string[][]; hashtags?: string[][] } = {}): MemoryStore {
  const own = seed.own ?? [{ id: "own-1", platform: "instagram" as const, handle: "kendi.hesap", followers: 1500 }];
  const store: MemoryStore = {
    rivals: [...(seed.rivals ?? [])],
    insertedRows: [],
    patches: [],
    ownAccounts: async () => own,
    knownRivals: async () => store.rivals.map((rival) => ({ ...rival })),
    ownContentSignals: async () => ({ coauthors: seed.coauthors ?? [], hashtags: seed.hashtags ?? [] }),
    insertCandidates: async (workspaceId, candidates) => {
      let written = 0;
      for (const candidate of candidates) {
        if (store.rivals.some((rival) => rival.platform === candidate.platform && rival.handle === candidate.handle)) continue;
        const row = toCandidateRow(workspaceId, candidate);
        store.insertedRows.push(row as Record<string, unknown>);
        store.rivals.push({ id: `cand-${store.rivals.length + 1}`, platform: candidate.platform, handle: candidate.handle, status: String(row.status), source: String(row.source), ...(candidate.followers === undefined ? {} : { followers: candidate.followers }) });
        written += 1;
      }
      return written;
    },
    updateCandidate: async (_workspaceId, id, patch) => {
      const rival = store.rivals.find((entry) => entry.id === id && entry.status === "candidate");
      if (rival === undefined) return false;
      store.patches.push({ id, patch });
      if (patch.followers !== undefined) rival.followers = patch.followers;
      if (patch.access !== undefined) rival.status = patch.access.state;
      return true;
    },
  };
  return store;
}

export interface ApifyHarness {
  deps: CollectDeps;
  start: ReturnType<typeof vi.fn<(request: BudgetedRunRequest) => Promise<BudgetedRun>>>;
  /** Başlatılan koşular: tür + etiket + beklenen sonuç. */
  started: () => { kind: string; label: string; expected: number; input: unknown }[];
}

/** Sahte Apify: `dataset(kind, request)` koşunun döndüreceği ham satırları verir; `unitPrice` sonuç başına fiyat. */
export function apifyHarness(options: { unitPrice?: number; dataset?: (kind: string, request: BudgetedRunRequest) => unknown[]; startFails?: (request: BudgetedRunRequest) => Error | undefined } = {}): ApifyHarness {
  const unit = options.unitPrice ?? 0.0025;
  const requests = new Map<string, BudgetedRunRequest>();
  let n = 0;
  const start = vi.fn(async (request: BudgetedRunRequest): Promise<BudgetedRun> => {
    const failure = options.startFails?.(request);
    if (failure) throw failure;
    n += 1;
    requests.set(`ds-${n}`, request);
    return { run: { id: `run-${n}` }, externalRunId: `ext-${n}`, datasetId: `ds-${n}`, estimate: { amountUsd: unit * request.expectedResults, priceUnknown: false } } as unknown as BudgetedRun;
  });
  const deps: CollectDeps = {
    client: fakeClient(),
    estimate: async (_actor, results) => ({ amountUsd: unit * results, unitPriceUsd: unit, priceUnknown: false }),
    start,
    wait: async (runId) => ({ run: { runId, status: "SUCCEEDED" }, timedOut: false }) as never,
    datasetItems: async (datasetId) => {
      const request = requests.get(datasetId);
      return request === undefined ? [] : (options.dataset?.(request.kind, request) ?? []);
    },
    reconcile: async () => ({ outcome: "reconciled", actualUsd: 0.01, reservedUsd: 0.01 }),
    clock: () => NOW,
    sleep: async () => undefined,
  };
  return { deps, start, started: () => start.mock.calls.map(([request]) => ({ kind: request.kind, label: request.targetLabel ?? "", expected: request.expectedResults, input: request.input })) };
}
