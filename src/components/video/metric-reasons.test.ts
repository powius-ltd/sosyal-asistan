import { describe, expect, it } from "vitest";

import { unmeasuredReason } from "@/components/video/metric-reasons";

const competitorReel = { owner: { kind: "competitor" as const }, format: "short_video" as const };
const ownReel = { owner: { kind: "own" as const }, format: "short_video" as const };
const carousel = { owner: { kind: "competitor" as const }, format: "carousel" as const };

describe("unmeasuredReason", () => {
  it("rakipte saves/reach/avgWatchSec için scraping sebebini verir", () => {
    for (const field of ["saves", "reach", "avgWatchSec"] as const) {
      expect(unmeasuredReason(field, competitorReel)).toContain("scraping");
    }
  });

  it("kendi hesapta aynı alanlar genel sebep alır", () => {
    expect(unmeasuredReason("saves", ownReel)).not.toContain("scraping");
  });

  it("karusel/görselde views için biçim sebebini verir", () => {
    expect(unmeasuredReason("views", carousel)).toContain("biçimde");
  });
});
