import { describe, expect, it } from "vitest";
import { MAX_USD_CEILING, parseCollectArgs } from "@/lib/collection/parse-args";
import { MAX_CONTENT_LIMIT } from "@/lib/collection/plan";

describe("parseCollectArgs", () => {
  it("varsayılan: limit 10, tavan $0,20, kuru koşu kapalı", () => {
    expect(parseCollectArgs([])).toEqual({ limit: 10, maxUsd: 0.2, dryRun: false });
  });

  it("--limit, --max-usd ve --dry-run", () => {
    expect(parseCollectArgs(["--limit=5", "--max-usd=0.35", "--dry-run"])).toEqual({ limit: 5, maxUsd: 0.35, dryRun: true });
  });

  it("geçersiz tavan reddedilir (0, negatif, metin, üst sınır aşımı)", () => {
    for (const bad of ["--max-usd=0", "--max-usd=-1", "--max-usd=abc", "--max-usd=", `--max-usd=${MAX_USD_CEILING + 1}`]) {
      expect(() => parseCollectArgs([bad]), bad).toThrow(/--max-usd/);
    }
  });

  it("geçersiz limit reddedilir (0, negatif, ondalık, metin, üst sınır aşımı)", () => {
    for (const bad of ["--limit=0", "--limit=-3", "--limit=2.5", "--limit=abc", "--limit=", `--limit=${MAX_CONTENT_LIMIT + 1}`]) {
      expect(() => parseCollectArgs([bad]), bad).toThrow(/--limit/);
    }
  });

  it("bilinmeyen bayrak sessizce yutulmaz", () => {
    expect(() => parseCollectArgs(["--dryrun"])).toThrow(/Bilinmeyen bayrak/);
  });
});
