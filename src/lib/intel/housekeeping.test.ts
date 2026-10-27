import { describe, expect, it } from "vitest";

import { failStaleSubscriptionRuns, runHousekeeping, STALE_RUN_MS } from "@/lib/intel/housekeeping";
import type { AdminClient } from "@/lib/supabase/admin";

const NOW = new Date("2026-09-30T12:00:00.000Z");

/** Zincirleme sorguyu kaydeden sahte istemci: filtreler ve yama gözlenir. */
function fakeClient(options: { updated?: number; rpc?: { data: number | null; error: { message: string } | null } } = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["update", "eq", "in", "lt"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.select = async () => ({ data: Array.from({ length: options.updated ?? 0 }, (_, i) => ({ id: `r${i}` })), error: null });
  const client = {
    from: (table: string) => {
      calls.push(["from", table]);
      return chain;
    },
    rpc: async (name: string, args: unknown) => {
      calls.push(["rpc", name, args]);
      return options.rpc ?? { data: 0, error: null };
    },
  };
  return { client: client as unknown as AdminClient, calls };
}

describe("betik başı bakımı", () => {
  it("2 saatten eski, kapanmamış ABONELİK koşuları failed olur (yalnız bu workspace, yalnız reserved/running)", async () => {
    const { client, calls } = fakeClient({ updated: 2 });
    await expect(failStaleSubscriptionRuns(client, "ws1", NOW)).resolves.toBe(2);

    expect(calls).toContainEqual(["from", "collection_runs"]);
    expect(calls).toContainEqual(["eq", "workspace_id", "ws1"]);
    expect(calls).toContainEqual(["eq", "billing", "subscription"]); // Apify (metered) koşularına dokunulmaz
    expect(calls).toContainEqual(["in", "status", ["reserved", "running"]]);
    expect(calls).toContainEqual(["lt", "started_at", new Date(NOW.getTime() - STALE_RUN_MS).toISOString()]);
    const patch = calls.find(([method]) => method === "update")?.[1] as { status: string; error: string; finished_at: string };
    expect(patch).toMatchObject({ status: "failed", finished_at: NOW.toISOString() });
    expect(patch.error).toContain("kapanmadı");
  });

  it("purge RPC'si çalışır ve hata verirse koşu durmaz: uyarı yazılır, sonraki adım yine çalışır", async () => {
    const { client, calls } = fakeClient({ updated: 1, rpc: { data: null, error: { message: "yetki yok" } } });
    const lines: string[] = [];
    await runHousekeeping({ client, workspaceId: "ws1", now: NOW }, (line) => lines.push(line));

    expect(calls).toContainEqual(["rpc", "purge_expired_transcripts", { p_now: NOW.toISOString() }]);
    expect(lines[0]).toContain("Uyarı: transcript temizliği başarısız");
    expect(lines[1]).toContain("1 abonelik koşusu");
  });
});
