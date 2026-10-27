import { describe, expect, it } from "vitest";

import { parseRoutineArgs } from "@/lib/orchestrator/args";

describe("parseRoutineArgs", () => {
  it("varsayılan: gerçek koşu, Apify onayı yok, eşzamanlılık 3", () => {
    expect(parseRoutineArgs([])).toEqual({ dryRun: false, concurrency: 3 });
  });

  it("--dry-run, --apify-max ve --concurrency okunur", () => {
    expect(parseRoutineArgs(["--dry-run", "--apify-max=0.30", "--concurrency=2"])).toEqual({ dryRun: true, apifyMaxUsd: 0.3, concurrency: 2 });
  });

  it("geçersiz tavan/eşzamanlılık ve bilinmeyen bayrak hata verir (yazım hatası para harcatmasın)", () => {
    for (const bad of ["--apify-max=", "--apify-max=0", "--apify-max=abc", "--apify-max=99", "--apify-max=-1", "--concurrency=0", "--concurrency=9", "--concurrency=x", "--dryrun", "--max-usd=1"]) {
      expect(() => parseRoutineArgs([bad]), bad).toThrow();
    }
  });
});
