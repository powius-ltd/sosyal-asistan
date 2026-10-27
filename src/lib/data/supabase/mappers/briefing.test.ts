import { describe, expect, it } from "vitest";

import { toBriefing, type BriefingRow } from "@/lib/data/supabase/mappers/briefing";

const row = (over: Partial<BriefingRow> = {}): BriefingRow => ({
  id: "dddddddd-0000-4000-8000-000000000001",
  workspace_id: "7a3f0000-0000-4000-8000-000000000001",
  agent: "analyst",
  generated_at: "2026-10-01T06:00:00+00:00",
  payload: {
    schemaVersion: 1,
    items: [{ kind: "worked", headline: "Başlık", body: "Metin.", evidence: ["c:ci_1"], confidence: "low" }],
  },
  basis: { analyzedCount: 24, labeledCount: 20 },
  prompt_version: "briefing-v1",
  persona_version: "persona-v1",
  model: null,
  run_id: null,
  ...over,
});

describe("toBriefing (satır → domain)", () => {
  it("geçerli satır eşlenir; NULL → undefined (model, koşu); zaman ISO UTC", () => {
    const briefing = toBriefing(row());
    expect(briefing).toMatchObject({ agent: "analyst", generatedAt: "2026-10-01T06:00:00.000Z", promptVersion: "briefing-v1", personaVersion: "persona-v1" });
    expect(briefing?.model).toBeUndefined();
    expect(briefing?.runId).toBeUndefined();
    expect(briefing?.items).toHaveLength(1);
    expect(briefing?.basis).toEqual({ analyzedCount: 24, labeledCount: 20 });
  });

  it("biçimi bozuk payload/basis ya da bilinmeyen rol → undefined (kısmen geçerli brifing gösterilmez)", () => {
    expect(toBriefing(row({ payload: { items: [{ kind: "worked" }] } }))).toBeUndefined();
    expect(toBriefing(row({ payload: { schemaVersion: 1, items: [{ kind: "worked", headline: "x", body: "y", evidence: [], confidence: "low" }] } }))).toBeUndefined();
    expect(toBriefing(row({ basis: { analyzedCount: "çok" } }))).toBeUndefined();
    expect(toBriefing(row({ agent: "stratejist" }))).toBeUndefined();
  });
});
