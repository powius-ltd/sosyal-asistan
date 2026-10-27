import { describe, expect, it } from "vitest";

import type { OwnAccount } from "@/lib/domain/competitor";
import { buildMockDataset } from "@/lib/data/mock/generators/dataset";
import { createClock } from "@/lib/data/mock/mock-clock";
import { filterOutliers, isSimilarSize } from "@/lib/data/mock/mock-filters";

const own = (id: string, followers: number | undefined, platform: OwnAccount["platform"] = "instagram") =>
  ({ id, platform, followers }) as OwnAccount;

describe("isSimilarSize (lib/metrics similarSize üzerinden)", () => {
  const accounts = [own("a", 1000), own("b", 50_000), own("t", 800, "tiktok")];

  it("±3x sınır dahil; herhangi bir kendi hesapla benzerse true", () => {
    expect(isSimilarSize(3000, "instagram", accounts)).toBe(true);
    expect(isSimilarSize(334, "instagram", accounts)).toBe(true);
    expect(isSimilarSize(150_000, "instagram", accounts)).toBe(true);
    expect(isSimilarSize(3001, "instagram", [own("a", 1000)])).toBe(false);
  });

  it("yalnız aynı platformdaki hesaplar karşılaştırılır", () => {
    expect(isSimilarSize(900, "tiktok", accounts)).toBe(true);
    expect(isSimilarSize(900, "youtube", accounts)).toBeUndefined();
  });

  it("takipçi 0 ya da bilinmiyor: ölçülemedi (undefined), 'benzer değil' (false) değil", () => {
    expect(isSimilarSize(0, "instagram", accounts)).toBeUndefined();
    expect(isSimilarSize(undefined, "instagram", accounts)).toBeUndefined();
  });

  it("kendi hesabın takipçisi bilinmiyor ya da 0 ise o hesap karşılaştırmaya girmez", () => {
    expect(isSimilarSize(500, "instagram", [own("x", undefined)])).toBeUndefined();
    expect(isSimilarSize(500, "instagram", [own("x", 0)])).toBeUndefined();
    expect(isSimilarSize(500, "instagram", [own("x", 0), own("y", 600)])).toBe(true);
  });

  it("hiç kendi hesap yoksa undefined", () => {
    expect(isSimilarSize(500, "instagram", [])).toBeUndefined();
  });
});

describe("filterOutliers: yalnız izlenen (tracked) rakipler", () => {
  const data = buildMockDataset(createClock());
  const outliers = (competitors = data.competitors) => filterOutliers(data.content, { limit: 200 }, data.ownAccounts, competitors);
  const target = outliers()[0].owner.id;

  it.each(["ignored", "candidate", "private", "not_found"] as const)("%s rakibin içerikleri çıkmaz", (status) => {
    const competitors = data.competitors.map((c) => (c.id === target ? { ...c, status } : c));
    expect(outliers(competitors).some((c) => c.owner.id === target)).toBe(false);
    expect(outliers(competitors).length).toBeGreaterThan(0); // diğer izlenen rakipler kalır
  });

  it("izlenen rakibin içeriği çıkar; kendi hesap içeriği hiçbir zaman çıkmaz", () => {
    expect(outliers().some((c) => c.owner.id === target)).toBe(true);
    expect(outliers().every((c) => c.owner.kind === "competitor")).toBe(true);
  });
});
