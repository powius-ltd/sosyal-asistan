import { describe, expect, it } from "vitest";

import { kpiGridClass } from "@/components/overview/extra-kpis";

describe("kpiGridClass (D3-20)", () => {
  it("dört kart geniş ekranda tek satır (dört sütun); tek kalan kart orta ekranda tam genişlik", () => {
    const cls = kpiGridClass(4);
    expect(cls).toContain("xl:grid-cols-4");
    expect(cls).toContain("sm:[&>*:last-child:nth-child(odd)]:col-span-2");
  });

  it("üç kart üç sütun; son kart geniş ekranda tek sütun kalır", () => {
    const cls = kpiGridClass(3);
    expect(cls).toContain("xl:grid-cols-3");
    expect(cls).toContain("xl:[&>*:last-child:nth-child(odd)]:col-span-1");
  });

  it("iki kart iki sütun", () => {
    expect(kpiGridClass(2)).toBe("grid gap-4 sm:grid-cols-2");
  });
});
