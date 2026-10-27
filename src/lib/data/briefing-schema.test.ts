import { describe, expect, it } from "vitest";

import { briefingBasisSchema, briefingItemSchema, briefingPayloadSchema, briefingRowSchema } from "@/lib/data/briefing-schema";
import type { BriefingItem } from "@/lib/domain/briefing";

const item = (over: Partial<BriefingItem> = {}): BriefingItem => ({
  kind: "worked",
  headline: "En iyi videon baz çizgisinin üstünde",
  body: "Tek video; zayıf sinyal.",
  evidence: ["c:ci_12"],
  confidence: "low",
  ...over,
});

const nextStep = (): BriefingItem =>
  item({ kind: "next_step", evidence: ["plan:2026-09-28"], action: { type: "open_plan", label: "Planı aç", target: "plan:2026-09-28", spendsMoney: false } });

describe("briefingItemSchema", () => {
  it("geçerli madde; next_step eylemle geçerli", () => {
    expect(briefingItemSchema.safeParse(item()).success).toBe(true);
    expect(briefingItemSchema.safeParse(nextStep()).success).toBe(true);
  });

  it("kanıtsız (boş ref), geçersiz ref, fazla ref ve boş metin reddedilir", () => {
    expect(briefingItemSchema.safeParse(item({ evidence: [] })).success).toBe(false);
    expect(briefingItemSchema.safeParse(item({ evidence: ["x:1"] as unknown as BriefingItem["evidence"] })).success).toBe(false);
    expect(briefingItemSchema.safeParse(item({ evidence: Array.from({ length: 7 }, (_, i) => `c:ci_${i}` as const) })).success).toBe(false);
    expect(briefingItemSchema.safeParse(item({ headline: "  " })).success).toBe(false);
    expect(briefingItemSchema.safeParse(item({ body: "a".repeat(501) })).success).toBe(false);
  });

  it("next_step eylemsiz reddedilir; tutarsız eylem reddedilir (para etiketi komut tablosuyla çelişir)", () => {
    expect(briefingItemSchema.safeParse(item({ kind: "next_step" })).success).toBe(false);
    const bad = item({ action: { type: "run_cmd", label: "Topla", commandId: "collect", spendsMoney: false } });
    expect(briefingItemSchema.safeParse(bad).success).toBe(false);
  });

  it("katı: bilinmeyen alan (ör. ajanın uydurduğu href/komut) reddedilir", () => {
    expect(briefingItemSchema.safeParse({ ...item(), href: "https://kotu.example" }).success).toBe(false);
    expect(briefingItemSchema.safeParse(item({ action: { type: "run_cmd", label: "x", commandId: "plan", spendsMoney: false, command: "rm -rf /" } as never })).success).toBe(false);
  });
});

describe("briefingPayloadSchema / briefingBasisSchema / briefingRowSchema", () => {
  it("payload: sürüm 1 ve 1–5 madde", () => {
    expect(briefingPayloadSchema.safeParse({ schemaVersion: 1, items: [item()] }).success).toBe(true);
    expect(briefingPayloadSchema.safeParse({ schemaVersion: 1, items: [] }).success).toBe(false);
    expect(briefingPayloadSchema.safeParse({ schemaVersion: 1, items: Array.from({ length: 6 }, () => item()) }).success).toBe(false);
    expect(briefingPayloadSchema.safeParse({ schemaVersion: 2, items: [item()] }).success).toBe(false);
    expect(briefingPayloadSchema.safeParse({ items: [item()] }).success).toBe(false);
  });

  it("basis: sayılar tam sayı ve ≥ 0; son toplama ISO; plan haftası Pazartesi; alan yoksa YOK (0/null değil)", () => {
    expect(briefingBasisSchema.safeParse({ analyzedCount: 24, labeledCount: 20 }).success).toBe(true);
    expect(briefingBasisSchema.safeParse({ analyzedCount: 24, labeledCount: 20, lastCollectedAt: "2026-09-30T09:00:00.000Z", planWeek: "2026-09-28" }).success).toBe(true);
    expect(briefingBasisSchema.safeParse({ analyzedCount: -1, labeledCount: 0 }).success).toBe(false);
    expect(briefingBasisSchema.safeParse({ analyzedCount: 1.5, labeledCount: 0 }).success).toBe(false);
    expect(briefingBasisSchema.safeParse({ analyzedCount: 1, labeledCount: 0, planWeek: "2026-09-29" }).success).toBe(false);
    expect(briefingBasisSchema.safeParse({ analyzedCount: 1, labeledCount: 0, lastCollectedAt: "dün" }).success).toBe(false);
    expect(briefingBasisSchema.safeParse({ analyzedCount: 1, labeledCount: 0, extra: 1 }).success).toBe(false);
  });

  it("satır: Analist rolü varsayılan; sürümler boş olamaz; bilinmeyen alan reddedilir", () => {
    const row = {
      workspace_id: "7a3f0000-0000-4000-8000-000000000001",
      payload: { schemaVersion: 1, items: [item()] },
      basis: { analyzedCount: 1, labeledCount: 0 },
      prompt_version: "briefing-v1",
      persona_version: "persona-v1",
    };
    const ok = briefingRowSchema.safeParse(row);
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.agent).toBe("analyst");
    expect(briefingRowSchema.safeParse({ ...row, persona_version: " " }).success).toBe(false);
    expect(briefingRowSchema.safeParse({ ...row, prompt_version: "" }).success).toBe(false);
    expect(briefingRowSchema.safeParse({ ...row, agent: "stratejist" }).success).toBe(false);
    expect(briefingRowSchema.safeParse({ ...row, ekstra: 1 }).success).toBe(false);
  });
});
