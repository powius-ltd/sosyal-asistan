import { describe, expect, it } from "vitest";

import { parseLabelArgs } from "@/lib/intel/label-args";

describe("parseLabelArgs", () => {
  it("varsayılan: gerçek koşu, sınırsız", () => expect(parseLabelArgs([])).toEqual({ dryRun: false }));
  it("--dry-run ve --limit", () => expect(parseLabelArgs(["--dry-run", "--limit=12"])).toEqual({ dryRun: true, limit: 12 }));
  it("yanlış yazılmış bayrak gerçek koşuya dönmez: bilinmeyen argüman hata", () => {
    expect(() => parseLabelArgs(["--dryrun"])).toThrow("Bilinmeyen argüman");
  });
  it("geçersiz --limit hata", () => {
    for (const bad of ["--limit=0", "--limit=abc", "--limit=", "--limit=1.5", "--limit=9999"]) expect(() => parseLabelArgs([bad])).toThrow("--limit");
  });
});
