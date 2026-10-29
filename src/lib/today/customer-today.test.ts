import { describe, expect, it } from "vitest";

import type { PublishJob } from "@/lib/domain/publish";
import type { WeeklyPlan } from "@/lib/domain/weekly-plan";
import type { StoryTile } from "@/lib/home/story-tiles";
import { automationLine } from "@/lib/today/automation-line";
import { buildNextShare, buildWaiting, weekSentence } from "@/lib/today/customer-today";

const now = new Date("2026-10-28T10:00:00.000Z");
const job = (id: string, scheduledFor: string | undefined, caption = id): PublishJob => ({ id, scheduledFor, caption }) as PublishJob;
const plan = (status: string, approvedAt?: string) => ({ status, approvedAt, items: [], alternatives: [] }) as unknown as WeeklyPlan;

describe("buildWaiting", () => {
  it("hiçbir şey beklemiyorsa undefined", () => {
    expect(buildWaiting({ pendingVideoCount: 0, plan: plan("ready", "2026-10-26T00:00:00Z") })).toBeUndefined();
    expect(buildWaiting({ pendingVideoCount: undefined, plan: null })).toBeUndefined();
  });
  it("video önce: Bak yayına gider", () => {
    const view = buildWaiting({ pendingVideoCount: 2, plan: plan("ready") });
    expect(view?.href).toBe("/yayin");
    expect(view?.parts).toHaveLength(2);
  });
  it("yalnız onaylanmamış plan: Bak plana gider; taslak plan beklemez", () => {
    expect(buildWaiting({ pendingVideoCount: 0, plan: plan("ready") })?.href).toBe("/bu-hafta");
    expect(buildWaiting({ pendingVideoCount: 0, plan: plan("draft") })).toBeUndefined();
  });
});

describe("buildNextShare", () => {
  it("gelecekteki en yakın işi seçer, geçmişi ve zamansızı atlar", () => {
    const view = buildNextShare([job("a", "2026-10-27T10:00:00Z"), job("b", undefined), job("c", "2026-10-30T16:00:00Z", "Geç"), job("d", "2026-10-29T16:00:00Z", "Erken")], null, now, "UTC");
    expect(view?.title).toBe("Erken");
    expect(view?.when).toContain("16:00");
  });
  it("iş yoksa undefined", () => {
    expect(buildNextShare([], null, now, "UTC")).toBeUndefined();
    expect(buildNextShare(undefined, null, now, "UTC")).toBeUndefined();
  });
});

describe("weekSentence", () => {
  const tile = (kind: StoryTile["kind"], sentence: string, figure?: string): StoryTile => ({ kind, sentence, figure });
  it("ölçülmüş ilk rakamlı cümleyi verir; 0 ve ölçülemeyeni atlar", () => {
    expect(weekSentence([tile("found", "Fikir.", "0"), tile("times", "Yön.", "2,8"), tile("result", "Sonuç.")])).toBe("Yön.");
    expect(weekSentence([tile("found", "Fikir.", "4"), tile("times", "Yön."), tile("result", "Sonuç.")])).toBe("Fikir.");
  });
  it("hiçbiri ölçülmediyse undefined", () => {
    expect(weekSentence([tile("found", "a", "0"), tile("times", "b"), tile("result", "c")])).toBeUndefined();
  });
});

describe("automationLine", () => {
  it("çalışma alanı ya da işler okunamadıysa undefined", () => {
    expect(automationLine(undefined, [], new Date("2026-10-29T12:00:00Z"))).toBeUndefined();
    expect(automationLine(null, undefined, new Date("2026-10-29T12:00:00Z"))).toBeUndefined();
  });
});
