import { describe, expect, it } from "vitest";

import { emptyAnatomyReport } from "@/lib/domain/anatomy";
import { canConfirmIdeaLink, IDEA_STATUSES } from "@/lib/domain/intel";
import {
  CHECKPOINT_DAYS,
  CHECKPOINT_WINDOW_DAYS,
  DIRECTION_HELD_MIN_LIFT,
  DIRECTION_STRONG_MIN_LIFT,
  toIdeaReelLink,
  type IdeaLink,
} from "@/lib/domain/outcomes";

const link = (status: IdeaLink["status"]): IdeaLink => ({
  id: "l1",
  workspaceId: "w",
  ideaId: "i",
  shortcode: "DdJy8QANttn",
  status,
  origin: "manual_url",
  reasons: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

describe("canConfirmIdeaLink", () => {
  it("yalnız reddedilmiş (dismissed) fikre Reels bağlanamaz; published dahil diğerleri bağlanır", () => {
    expect(IDEA_STATUSES.filter((s) => !canConfirmIdeaLink(s))).toEqual(["dismissed"]);
  });
});

describe("kontrol noktası pencereleri", () => {
  it("D+1 [1,2], D+3 [3,5], D+7 [7,10]: ayrık ve sıralı (bir Reels'in aynı anda en çok bir bekleyen noktası olur)", () => {
    expect(CHECKPOINT_DAYS).toEqual([1, 3, 7]);
    expect(CHECKPOINT_WINDOW_DAYS).toEqual({ 1: { from: 1, to: 2 }, 3: { from: 3, to: 5 }, 7: { from: 7, to: 10 } });
    for (const [i, day] of CHECKPOINT_DAYS.entries()) {
      const window = CHECKPOINT_WINDOW_DAYS[day];
      expect(window.from, "pencere kendi gününden başlar").toBe(day);
      expect(window.to).toBeGreaterThanOrEqual(window.from);
      const next = CHECKPOINT_DAYS[i + 1];
      if (next !== undefined) expect(window.to, `D+${day} penceresi D+${next}'ten önce biter`).toBeLessThan(CHECKPOINT_WINDOW_DAYS[next].from);
    }
  });

  it("'yön tuttu' eşikleri: D+7 lift ≥ 1,0 tuttu, ≥ 1,5 güçlü", () => {
    expect([DIRECTION_HELD_MIN_LIFT, DIRECTION_STRONG_MIN_LIFT]).toEqual([1, 1.5]);
  });
});

describe("toIdeaReelLink", () => {
  it("yalnız aktif bağlar (bekleyen/onaylı) fikir kartına girer; öneri ve reddedilen girmez", () => {
    expect(toIdeaReelLink(link("confirmed"))).toMatchObject({ linkId: "l1", status: "confirmed", shortcode: "DdJy8QANttn" });
    expect(toIdeaReelLink(link("awaiting_content"))?.status).toBe("awaiting_content");
    expect(toIdeaReelLink(link("suggested"))).toBeUndefined();
    expect(toIdeaReelLink(link("rejected"))).toBeUndefined();
  });
});

describe("emptyAnatomyReport", () => {
  it("boş rapor serileştirilebilir (düz veri) ve her bölüm sebebiyle ölçülemeyen", () => {
    const report = emptyAnatomyReport(
      { workspaceId: "w", ownHandles: ["ornek"], days: 90, since: "2026-07-03T00:00:00.000Z", until: "2026-10-01T00:00:00.000Z", winnerMinLift: 3 },
      "2026-10-01T00:00:00.000Z",
    );
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(report.counts).toEqual({ analyzed: 0, own: 0, rivals: 0, winners: 0 });
    expect(report.unmeasured.map((u) => u.section)).toHaveLength(7);
    expect(report.unmeasured.every((u) => u.reason.length > 0)).toBe(true);
  });
});
