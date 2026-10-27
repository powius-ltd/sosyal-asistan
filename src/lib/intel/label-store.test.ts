import { describe, expect, it, vi } from "vitest";

import { toLabelRow, saveLabels } from "@/lib/intel/label-store";
import type { AngleLabel } from "@/lib/llm/label-angles";
import type { AdminClient } from "@/lib/supabase/admin";

const WS = "7a3f0000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-01T09:00:00.000Z");
const label = (patch: Partial<AngleLabel> = {}): AngleLabel => ({
  id: "c0ffee00-0000-4000-8000-000000000001",
  angle: "kimlik",
  funnelStage: "sorunu-biliyor",
  angleEvidence: "this is for women who carry everything",
  funnelEvidence: "you already feel it",
  evidenceVerified: true,
  ...patch,
});
const ctx = { workspaceId: WS, promptVersion: "label-angles-v1", model: "claude-test", runId: "11111111-1111-4111-8111-111111111111", now: NOW };

describe("toLabelRow", () => {
  it("alanları DB sütunlarına eşler; evidence_verified AÇIKÇA yazılır (false dahil)", () => {
    expect(toLabelRow(label(), ctx)).toMatchObject({
      workspace_id: WS,
      angle: "kimlik",
      funnel_stage: "sorunu-biliyor",
      evidence_verified: true,
      prompt_version: "label-angles-v1",
      model: "claude-test",
      run_id: ctx.runId,
      labeled_at: NOW.toISOString(),
    });
    expect(toLabelRow(label({ evidenceVerified: false }), ctx)).toHaveProperty("evidence_verified", false);
  });

  it("koşu/model yoksa null yazılır", () => {
    expect(toLabelRow(label(), { workspaceId: WS, promptVersion: "v1", now: NOW })).toMatchObject({ model: null, run_id: null });
  });

  it("şemaya uymayan satır yazılmaz: boş alıntı, 300 karakteri aşan alıntı, boş sürüm", () => {
    expect(() => toLabelRow(label({ angleEvidence: "   " }), ctx)).toThrow();
    expect(() => toLabelRow(label({ funnelEvidence: "x".repeat(301) }), ctx)).toThrow();
    expect(() => toLabelRow(label(), { ...ctx, promptVersion: " " })).toThrow();
  });
});

describe("saveLabels", () => {
  it("etiket yoksa (hepsi unsure) DB'ye hiç istek atılmaz", async () => {
    const from = vi.fn();
    await saveLabels({ from } as unknown as AdminClient, [], ctx);
    expect(from).not.toHaveBeenCalled();
  });

  it("içerik başına tek güncel satır: upsert, çakışma anahtarı content_item_id", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    await saveLabels({ from } as unknown as AdminClient, [label(), label({ id: "c0ffee00-0000-4000-8000-000000000002", evidenceVerified: false })], ctx);
    expect(from).toHaveBeenCalledWith("content_creative_labels");
    expect(upsert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ evidence_verified: false })]), { onConflict: "content_item_id" });
    expect(upsert.mock.calls[0][0]).toHaveLength(2);
  });

  it("DB hatası sessizce yutulmaz", async () => {
    const from = vi.fn().mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: { message: "boom" } }) });
    await expect(saveLabels({ from } as unknown as AdminClient, [label()], ctx)).rejects.toThrow("boom");
  });
});
