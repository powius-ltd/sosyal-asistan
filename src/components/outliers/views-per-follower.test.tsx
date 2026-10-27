// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { testItem } from "@/components/content/test-item";
import { ViewsPerFollowerLabel, ViewsPerFollowerValue } from "@/components/outliers/outlier-metrics";
import {
  FOLLOWERS_UNMEASURED_REASON,
  FOLLOWERS_ZERO_REASON,
  formatViewsPerFollower,
  VIEWS_UNMEASURED_REASON,
  viewsPerFollower,
} from "@/components/outliers/views-per-follower";

describe("viewsPerFollower", () => {
  it("izlenme ÷ takipçi oranını verir", () => {
    expect(viewsPerFollower(6_900, 100_000)).toEqual({ status: "measured", value: 0.069 });
    expect(viewsPerFollower(250_000, 10_000)).toEqual({ status: "measured", value: 25 });
  });

  it("0 izlenme gerçek ölçümdür (oran 0), ölçülemedi değil", () => {
    expect(viewsPerFollower(0, 5_000)).toEqual({ status: "measured", value: 0 });
  });

  it("takipçi yok → sebepli ölçülemedi; takipçi 0 → bölme yok; izlenme yok → sebepli ölçülemedi", () => {
    expect(viewsPerFollower(1_000, undefined)).toEqual({ status: "unmeasured", reason: FOLLOWERS_UNMEASURED_REASON });
    expect(viewsPerFollower(1_000, 0)).toEqual({ status: "unmeasured", reason: FOLLOWERS_ZERO_REASON });
    expect(viewsPerFollower(undefined, 1_000)).toEqual({ status: "unmeasured", reason: VIEWS_UNMEASURED_REASON });
    expect(viewsPerFollower(Number.NaN, 1_000)).toEqual({ status: "unmeasured", reason: VIEWS_UNMEASURED_REASON });
  });
});

describe("formatViewsPerFollower", () => {
  it("küçük oranda bir, büyük oranda sıfır ondalık basamak", () => {
    expect(formatViewsPerFollower(0.069)).toBe("%6,9");
    expect(formatViewsPerFollower(0.69)).toBe("%69");
    expect(formatViewsPerFollower(12.34)).toBe("%1.234");
  });
});

describe("ViewsPerFollowerValue", () => {
  it("izlenme/takipçi yüzdesini gösterir; çapraz skor ve negatif sayı görünmez", () => {
    const item = testItem({
      id: "ci_1",
      owner: { kind: "competitor", id: "cp_1", handle: "noelle", followers: 100_000 },
      metrics: { views: 6_900, extra: {} },
      // izlenme < takipçi: ham çapraz skor negatif çıkardı
      score: { lowConfidence: false, immature: false, crossScore: -14.3 },
    });
    const { container } = render(<ViewsPerFollowerValue item={item} />);
    expect(screen.getByText("%6,9")).toBeInTheDocument();
    expect(container.textContent).not.toContain("-14");
  });

  it("takipçi ölçülemediyse tire gösterir, %0 değil", () => {
    const item = testItem({
      id: "ci_2",
      owner: { kind: "competitor", id: "cp_1", handle: "noelle" },
      metrics: { views: 6_900, extra: {} },
    });
    const { container } = render(<ViewsPerFollowerValue item={item} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(container.textContent).not.toContain("%0");
  });
});

describe("ViewsPerFollowerLabel", () => {
  it("etiket olarak izlenme / takipçi yazar", () => {
    render(<ViewsPerFollowerLabel />);
    expect(screen.getByText("İzlenme / takipçi")).toBeInTheDocument();
  });
});
