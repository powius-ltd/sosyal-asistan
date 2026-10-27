import { describe, expect, it } from "vitest";

import { buildViralTopics, cleanTopic, nicheTopic } from "@/lib/viral/queries";

describe("cleanTopic", () => {
  it("# ve noktalama atılır, Türkçe küçük harf", () => {
    expect(cleanTopic("#İstanbul Kahve!")).toBe("istanbul kahve");
  });
  it("uzunluk dışı undefined", () => {
    expect(cleanTopic("a")).toBeUndefined();
    expect(cleanTopic("x".repeat(41))).toBeUndefined();
  });
});

describe("nicheTopic", () => {
  it("ilk cümleden en çok 4 anlamlı sözcük", () => {
    expect(nicheTopic("Evde kahve demleme üzerine kısa videolar. İkinci cümle.")).toBe("evde kahve demleme üzerine");
  });
  it("boşsa undefined", () => {
    expect(nicheTopic(null)).toBeUndefined();
  });
});

describe("buildViralTopics", () => {
  it("sıra: elle → niş → küme → etiket; en çok 3", () => {
    const topics = buildViralTopics({
      manual: ["Yapay Zeka"],
      nicheBrief: "Girişimci araçları anlatımı.",
      clusters: [{ label: "otomasyon", count: 4 }, { label: "satış", count: 9 }],
      hashtags: [["makro"]],
    });
    expect(topics.map((t) => t.source)).toEqual(["manual", "niche", "cluster"]);
    expect(topics[2].query).toBe("satış");
  });
  it("tekilleştirir (Türkçe harf farkı dahil) ve genel etiketleri atar", () => {
    const topics = buildViralTopics({ manual: ["Kahve", "kahve"], hashtags: [["reels", "fyp", "demleme"], ["demleme"]] }, 5);
    expect(topics.map((t) => t.query)).toEqual(["kahve", "demleme"]);
  });
  it("kaynak yoksa boş", () => {
    expect(buildViralTopics({})).toEqual([]);
  });
});
