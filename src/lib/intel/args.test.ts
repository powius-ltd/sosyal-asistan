import { describe, expect, it } from "vitest";

import { nextMondayOf, parseAnalyzeArgs, parsePlanArgs } from "@/lib/intel/args";

describe("parseAnalyzeArgs", () => {
  it("varsayılan: limit 19, eşzamanlılık 3, pilot/dry-run kapalı", () => {
    expect(parseAnalyzeArgs([])).toEqual({ pilot: false, limit: 19, dryRun: false, concurrency: 3 });
  });
  it("--concurrency 1–6 kabul edilir; 0, 7, ondalıklı, boş ve sayı olmayan hata verir", () => {
    expect(parseAnalyzeArgs(["--concurrency=1"]).concurrency).toBe(1);
    expect(parseAnalyzeArgs(["--concurrency=4"]).concurrency).toBe(4);
    expect(parseAnalyzeArgs(["--concurrency=6"]).concurrency).toBe(6);
    for (const bad of ["0", "7", "2.5", "", "abc", "-1"]) expect(() => parseAnalyzeArgs([`--concurrency=${bad}`]), bad).toThrow("--concurrency 1–6");
  });
  it("bayrakları okur; geçersiz limit ve bilinmeyen argüman hata verir", () => {
    expect(parseAnalyzeArgs(["--pilot", "--limit=5", "--dry-run"])).toEqual({ pilot: true, limit: 5, dryRun: true, concurrency: 3 });
    expect(() => parseAnalyzeArgs(["--limit=0"])).toThrow();
    expect(() => parseAnalyzeArgs(["--limit=abc"])).toThrow();
    expect(() => parseAnalyzeArgs(["--dryrun"])).toThrow("Bilinmeyen argüman");
  });
});

describe("parsePlanArgs", () => {
  it("--week Pazartesi'ye hizalanır; geçersiz tarih hata verir", () => {
    expect(parsePlanArgs(["--week=2026-10-07", "--dry-run"])).toEqual({ week: "2026-10-05", dryRun: true });
    expect(parsePlanArgs([])).toEqual({ dryRun: false });
    expect(() => parsePlanArgs(["--week=2026-02-31"])).toThrow();
    expect(() => parsePlanArgs(["--foo"])).toThrow();
  });
});

describe("nextMondayOf", () => {
  it("gelecek Pazartesi; bugün Pazartesi ise bir sonraki", () => {
    expect(nextMondayOf("2026-09-30")).toBe("2026-10-05"); // Çarşamba
    expect(nextMondayOf("2026-10-04")).toBe("2026-10-05"); // Pazar
    expect(nextMondayOf("2026-10-05")).toBe("2026-10-12"); // Pazartesi
  });
});
