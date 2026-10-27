import { describe, expect, it, vi } from "vitest";

import type { BriefingRunResult } from "@/lib/intel/briefing-run";
import type { IntelContext } from "@/lib/intel/context";
import type { ClusterOnlyResult } from "@/lib/intel/plan-run";
import { briefingRunnerOf, clusterRunnerOf } from "@/lib/orchestrator/step-runners";
import { baseState } from "@/lib/orchestrator/test-support";

const intel = { workspaceId: "ws-1" } as unknown as IntelContext;
const log = () => undefined;
const cluster = (overrides: Partial<ClusterOnlyResult>): ClusterOnlyResult => ({ outcome: "clustered", clusters: 2, contents: 8, notes: [], seconds: 1, ...overrides });

describe("briefingRunnerOf", () => {
  it("başarı: madde sayısı ve süre nota iner; koşucu turun bağlamı ve günlüğüyle çağrılır", async () => {
    const run = vi.fn(async (): Promise<BriefingRunResult> => ({ ok: true, items: [{}, {}, {}], seconds: 41.6 }) as unknown as BriefingRunResult);
    expect(await briefingRunnerOf(run)({ intel, state: baseState(), log })).toEqual({ ok: true, note: "3 madde (42 sn)" });
    expect(run).toHaveBeenCalledWith(intel, { log });
  });

  it("başarısızlık fırlatılmaz: kod ve neden nota iner (adım failed olur, önceki notlar kalır)", async () => {
    const run = async (): Promise<BriefingRunResult> => ({ ok: false, code: "invalid_output", message: "şema", persistent: false, seconds: 1 }) as BriefingRunResult;
    expect(await briefingRunnerOf(run)({ intel, state: baseState(), log })).toEqual({ ok: false, note: "invalid_output: şema" });
  });
});

describe("clusterRunnerOf", () => {
  it("kümelendi → tamam; başarısız → failed; diğer sonuçlar tasarım gereği atlandı (notlar tek satırda)", async () => {
    const run = vi.fn(async () => cluster({}));
    expect(await clusterRunnerOf(run)({ intel, log })).toEqual({ ok: true, note: "2 küme, 8 içerik" });
    expect(run).toHaveBeenCalledWith(intel, log);
    expect(await clusterRunnerOf(async () => cluster({ outcome: "failed", clusters: 0, contents: 0, notes: ["Yazı aracı yanıt vermedi."] }))({ intel, log })).toEqual({ ok: false, note: "0 küme, 0 içerik · Yazı aracı yanıt vermedi." });
    const skipped = cluster({ outcome: "too_few", clusters: 0, contents: 2, notes: ["Yeterli video yok."] });
    expect(await clusterRunnerOf(async () => skipped)({ intel, log })).toEqual({ ok: true, skipped: true, note: "0 küme, 2 içerik · Yeterli video yok." });
  });
});
