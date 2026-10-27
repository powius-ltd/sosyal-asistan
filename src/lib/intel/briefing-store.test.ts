import { describe, expect, it, vi } from "vitest";

import type { BriefingItem } from "@/lib/domain/briefing";
import { saveBriefing, toBriefingRow } from "@/lib/intel/briefing-store";
import type { AdminClient } from "@/lib/supabase/admin";

const WS = "7a3f0000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-01T09:00:00.000Z");
const item = (patch: Partial<BriefingItem> = {}): BriefingItem => ({ kind: "changed", headline: "Başlık", body: "Metin.", evidence: ["c:ci_1"], confidence: "low", ...patch });
const input = (items: BriefingItem[]) => ({ workspaceId: WS, items, basis: { analyzedCount: 3, labeledCount: 2 }, promptVersion: "analyst-v1", personaVersion: "persona-v1", now: NOW });

describe("toBriefingRow", () => {
  it("geçerli brifing → doğrulanmış satır (sürüm, rol, zaman, null model/koşu)", () => {
    const row = toBriefingRow(input([item()]));
    expect(row).toMatchObject({ workspace_id: WS, agent: "analyst", generated_at: NOW.toISOString(), model: null, run_id: null, prompt_version: "analyst-v1", persona_version: "persona-v1" });
    expect(row.payload).toEqual({ schemaVersion: 1, items: [item()] });
    expect(row.basis).toEqual({ analyzedCount: 3, labeledCount: 2 }); // yok olan alan yazılmaz (undefined ≠ 0)
  });

  it("şemaya uymayan brifing yazılmaz: kanıtsız madde, eylemsiz next_step, tutarsız eylem, 0 ve 6 madde", () => {
    expect(() => toBriefingRow(input([item({ evidence: [] })]))).toThrow();
    expect(() => toBriefingRow(input([item({ kind: "next_step" })]))).toThrow();
    expect(() => toBriefingRow(input([item({ action: { type: "run_cmd", label: "Veriyi topla", commandId: "collect", spendsMoney: false } })]))).toThrow(); // collect paralıdır
    expect(() => toBriefingRow(input([]))).toThrow();
    expect(() => toBriefingRow(input(Array.from({ length: 6 }, () => item())))).toThrow();
  });
});

describe("saveBriefing", () => {
  it("agent_briefings'e ekler ve kimliği döndürür; hata → fırlatır", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "b-1" }, error: null });
    const insert = vi.fn().mockReturnValue({ select: () => ({ single }) });
    const from = vi.fn().mockReturnValue({ insert });
    const row = toBriefingRow(input([item()]));
    expect(await saveBriefing({ from } as unknown as AdminClient, row)).toBe("b-1");
    expect(from).toHaveBeenCalledWith("agent_briefings");
    expect(insert).toHaveBeenCalledWith(row);

    single.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(saveBriefing({ from } as unknown as AdminClient, row)).rejects.toThrow(/Brifing yazılamadı: boom/);
  });
});
