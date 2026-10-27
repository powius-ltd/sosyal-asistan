import { describe, expect, it } from "vitest";

import { makePlan } from "@/components/weekly-plan/test-fixtures";
import type { Checkpoint, CheckpointDay, WeekReview, WeekReviewItem } from "@/lib/domain/outcomes";
import { nextPlanItem, planItemStatuses } from "@/lib/overview/plan-item-status";

const checkpoint = (day: CheckpointDay, patch: Partial<Checkpoint>): Checkpoint => ({
  day,
  status: "upcoming",
  windowStart: "2026-10-06T00:00:00.000Z",
  windowEnd: "2026-10-07T00:00:00.000Z",
  ...patch,
});

function reviewOf(ideaId: string, checkpoints: Checkpoint[], linkStatus: "confirmed" | "awaiting_content" = "confirmed"): WeekReview {
  const item: WeekReviewItem = {
    ideaId,
    title: ideaId,
    suggestionCount: 0,
    link: { linkId: "l1", status: linkStatus, origin: "manual_url", shortcode: "abc" },
    checkpoints,
    directions: [],
  };
  return { planId: "plan-1", weekStart: "2026-10-05", planGeneratedAt: "", computedAt: "", items: [item], directions: [], summary: { planned: 4, linked: 1, measuredD7: 0, held: 0, missed: 0, unmeasured: 0 } };
}

describe("planItemStatuses", () => {
  it("hiçbiri yayınlanmadıysa ilki sırada, kalanı çekilecek", () => {
    const plan = makePlan();
    expect(planItemStatuses(plan, null, "2026-10-05").map((s) => s.kind)).toEqual(["next", "to_shoot", "to_shoot", "to_shoot"]);
  });

  it("yayınlanan madde atlanır: sıradaki ilk yayınlanmamış olur", () => {
    const plan = makePlan();
    plan.items[0].idea = { ...plan.items[0].idea, status: "published" };
    const statuses = planItemStatuses(plan, undefined, "2026-10-05");
    expect(statuses.map((s) => s.kind)).toEqual(["published", "next", "to_shoot", "to_shoot"]);
    expect(nextPlanItem(plan, statuses)?.ideaId).toBe("idea-2");
  });

  it("7. gün sonucu varsa düz cümleyle sonuç; tutan eşiği (3 kat) güçlü sayılır", () => {
    const plan = makePlan();
    const strong = planItemStatuses(plan, reviewOf("idea-1", [checkpoint(7, { status: "measured", lift: 3.4 })]), "2026-10-05")[0];
    expect(strong).toMatchObject({ kind: "result", resultPhrase: "normalinin 3,4 katı izlendi", strongResult: true });
    const weak = planItemStatuses(plan, reviewOf("idea-1", [checkpoint(7, { status: "measured", lift: 0.96 })]), "2026-10-05")[0];
    expect(weak).toMatchObject({ kind: "result", resultPhrase: "normal düzeyde izlendi", strongResult: false });
  });

  it("ölçüm sürüyorsa sonucu bekliyor (sıradaki gün), 7. gün lift'i yoksa sonuç iddia edilmez", () => {
    const plan = makePlan();
    const waiting = planItemStatuses(
      plan,
      reviewOf("idea-1", [checkpoint(1, { status: "measured", views: 100 }), checkpoint(3, { status: "due" }), checkpoint(7, { status: "upcoming" })]),
      "2026-10-05",
    )[0];
    expect(waiting).toEqual({ kind: "awaiting_result", waitingDay: 3 });
    const noLift = planItemStatuses(plan, reviewOf("idea-1", [checkpoint(7, { status: "measured" })]), "2026-10-05")[0];
    expect(noLift.kind).not.toBe("result");
  });

  it("zamanında ölçülmeyen yayın yalnız 'yayınlandı' olur; içerik bekleyen bağ da yayınlanmış sayılır", () => {
    const plan = makePlan();
    const missed = planItemStatuses(plan, reviewOf("idea-1", [checkpoint(7, { status: "missed" })]), "2026-10-05")[0];
    expect(missed.kind).toBe("published");
    const awaitingContent = planItemStatuses(plan, reviewOf("idea-1", [], "awaiting_content"), "2026-10-05")[0];
    expect(awaitingContent.kind).toBe("published");
  });

  it("geçmiş haftanın planında yayınlanmayanlar 'çekilmedi' olur, sıradaki yoktur", () => {
    const plan = makePlan({ weekStart: "2026-09-28" });
    const statuses = planItemStatuses(plan, null, "2026-10-05");
    expect(statuses.every((s) => s.kind === "not_shot")).toBe(true);
    expect(nextPlanItem(plan, statuses)).toBeUndefined();
  });

  it("vazgeçilen fikir sıradaki olmaz", () => {
    const plan = makePlan();
    plan.items[0].idea = { ...plan.items[0].idea, status: "dismissed" };
    expect(planItemStatuses(plan, null, "2026-10-05").map((s) => s.kind).slice(0, 2)).toEqual(["skipped", "next"]);
  });
});
