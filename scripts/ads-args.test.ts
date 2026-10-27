import { describe, expect, it } from "vitest";

import { parseAdsArgs } from "./ads-args";

describe("npm run ads bayrakları", () => {
  it("accounts / sync", () => {
    expect(parseAdsArgs(["accounts", "--dry-run"])).toEqual({ command: "accounts", dryRun: true });
    expect(parseAdsArgs(["sync", "--days=14"])).toEqual({ command: "sync", dryRun: false, days: 14 });
  });
  it("link: hedefle birlikte", () => {
    expect(parseAdsArgs(["link", "--ad-account=act_123456", "--currency=try", "--goal=value", "--result=satın alma", "--target=2"])).toEqual({
      command: "link", dryRun: false, adAccount: "act_123456", currency: "TRY", goal: { kind: "value", resultLabel: "satın alma", target: 2 },
    });
  });
  it("link: --margin 0–1 arası, none siler", () => {
    const base = ["link", "--ad-account=act_123456", "--goal=value", "--result=satın alma", "--target=2"];
    expect(parseAdsArgs([...base, "--margin=0.4"])).toMatchObject({ margin: 0.4 });
    expect(parseAdsArgs([...base, "--margin=1"])).toMatchObject({ margin: 1 });
    expect(parseAdsArgs([...base, "--margin=none"])).toMatchObject({ margin: null });
    expect(parseAdsArgs(["link", "--ad-account=act_123456", "--margin=0.5"])).toMatchObject({ margin: 0.5 });
    expect(parseAdsArgs(base)).not.toHaveProperty("margin");
    expect(parseAdsArgs(["link", "--ad-account=act_123456", "--goal=cost", "--result=x", "--target=3", "--margin=none"])).toMatchObject({ margin: null });
  });
  it("link: --margin geçersiz ya da maliyet hedefiyle çelişirse reddedilir", () => {
    const base = ["link", "--ad-account=act_123456"];
    for (const bad of ["0", "-0.1", "1.5", "abc", "", "40%"]) expect(() => parseAdsArgs([...base, `--margin=${bad}`]), bad).toThrow();
    expect(() => parseAdsArgs([...base, "--margin"])).toThrow();
    expect(() => parseAdsArgs([...base, "--goal=cost", "--result=x", "--target=3", "--margin=0.4"])).toThrow(/maliyet/);
    expect(() => parseAdsArgs(["sync", "--margin=0.4"])).toThrow();
  });
  it("hatalı girdi reddedilir", () => {
    for (const bad of [[], ["x"], ["sync", "--days=0"], ["sync", "--days=91"], ["sync", "--foo"], ["accounts", "--dry-run=1"], ["link"], ["link", "--ad-account=123"], ["link", "--ad-account=act_123456", "--goal=value"], ["link", "--ad-account=act_123456", "--goal=cost", "--result=x", "--target=-1"]]) {
      expect(() => parseAdsArgs(bad), bad.join(" ")).toThrow();
    }
  });
});
