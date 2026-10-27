/** Plan brifi (`weekly_plans.brief`): sürümlü yazım, tam gidiş-dönüş, NULL / eski / bozuk kayıt = brif yok (plan düşmez). */
import { describe, expect, it } from "vitest";

import { PLAN_BRIEF_SCHEMA_VERSION, parsePlanBrief, planBriefToStorage } from "@/lib/data/weekly-plan-schema";
import { SEED_PLAN_BRIEF } from "@/lib/data/supabase/testing/seed-plan";

describe("plan brifi saklama biçimi", () => {
  it("yazılan biçim sürüm taşır ve okununca aynı brif döner", () => {
    const stored = planBriefToStorage(SEED_PLAN_BRIEF);
    expect(stored.schemaVersion).toBe(PLAN_BRIEF_SCHEMA_VERSION);
    expect(parsePlanBrief(JSON.parse(JSON.stringify(stored)))).toEqual(SEED_PLAN_BRIEF);
  });

  it("NULL (brifsiz / eski plan), bilinmeyen sürüm ve bozuk kayıt brif yok sayılır (undefined)", () => {
    expect(parsePlanBrief(null)).toBeUndefined();
    expect(parsePlanBrief([])).toBeUndefined();
    expect(parsePlanBrief({ ...planBriefToStorage(SEED_PLAN_BRIEF), schemaVersion: 99 })).toBeUndefined();
    expect(parsePlanBrief({ schemaVersion: PLAN_BRIEF_SCHEMA_VERSION, theme: 5 })).toBeUndefined();
  });

  it("biçimsiz slot kimliği yazılamaz (DB check ile aynı kural)", () => {
    const bad = { ...SEED_PLAN_BRIEF, slots: [{ ...SEED_PLAN_BRIEF.slots[0], slotId: "X1" }] };
    expect(() => planBriefToStorage(bad)).toThrow();
  });
});
