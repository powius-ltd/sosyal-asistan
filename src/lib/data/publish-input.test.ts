import { describe, expect, it } from "vitest";

import { ADVERTISER_NAME_MAX } from "@/lib/domain/publish";
import { parseAdvertiserName, parseTrial } from "@/lib/data/publish-input";

describe("parseAdvertiserName", () => {
  it("kırpar; boş metin ve undefined 'yok' demektir; sınır kod noktası sayar", () => {
    expect(parseAdvertiserName("  Kahveci Ltd ")).toBe("Kahveci Ltd");
    expect(parseAdvertiserName("   ")).toBeUndefined();
    expect(parseAdvertiserName(undefined)).toBeUndefined();
    expect(parseAdvertiserName("\u{1F600}".repeat(ADVERTISER_NAME_MAX))).toHaveLength(ADVERTISER_NAME_MAX * 2);
  });

  it("çok uzun ad ve metin olmayan değer invalid_input", () => {
    for (const bad of ["x".repeat(ADVERTISER_NAME_MAX + 1), 42, null, {}]) {
      expect(() => parseAdvertiserName(bad), String(bad)).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    }
  });
});

describe("parseTrial", () => {
  it("geçerli ayarı olduğu gibi döndürür; undefined = trial değil", () => {
    expect(parseTrial({ enabled: true, graduation: "manual" })).toEqual({ enabled: true, graduation: "manual" });
    expect(parseTrial({ enabled: false, graduation: "performance" })).toEqual({ enabled: false, graduation: "performance" });
    expect(parseTrial(undefined)).toBeUndefined();
  });

  it("bilinmeyen strateji, eksik/yanlış tipli ve fazladan alan invalid_input", () => {
    const bad = [
      { enabled: true, graduation: "auto" },
      { enabled: true },
      { graduation: "manual" },
      { enabled: "true", graduation: "manual" },
      { enabled: true, graduation: "manual", x: 1 },
      null,
      "manual",
    ];
    for (const input of bad) expect(() => parseTrial(input), JSON.stringify(input)).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
});
