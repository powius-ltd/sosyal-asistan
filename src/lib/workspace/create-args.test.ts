import { describe, expect, it } from "vitest";

import { parseCreateArgs } from "@/lib/workspace/create-args";

describe("parseCreateArgs", () => {
  it("bayrakları şema alanlarına eşler; değerde = ve boşluk korunur", () => {
    expect(
      parseCreateArgs([
        "--name=Kahve = Dükkan",
        "--handle=@kahve",
        "--niche=Üçüncü dalga",
        "--tz=Europe/Istanbul",
        "--audience-tz=America/New_York",
        "--region=TR_US",
        "--platform=instagram",
      ]),
    ).toEqual({
      name: "Kahve = Dükkan",
      handle: "@kahve",
      nicheBrief: "Üçüncü dalga",
      timezone: "Europe/Istanbul",
      audienceTimezone: "America/New_York",
      complianceRegion: "TR_US",
      platform: "instagram",
    });
  });

  it("bilinmeyen bayrak ve tekrar hata verir (yazım hatası sessizce yutulmaz)", () => {
    expect(() => parseCreateArgs(["--isim=x"])).toThrowError(/Bilinmeyen bayrak/);
    expect(() => parseCreateArgs(["x"])).toThrowError(/Bilinmeyen bayrak/);
    expect(() => parseCreateArgs(["--name=a", "--name=b"])).toThrowError(/bir kez/);
  });
});
