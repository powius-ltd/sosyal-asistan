import { describe, expect, it } from "vitest";

import { parseWeekStart } from "@/lib/data/weekly-plan-input";

describe("parseWeekStart", () => {
  it("Pazartesi olduğu gibi; diğer günler haftasının Pazartesi'sine hizalanır; boşluk kırpılır", () => {
    expect(parseWeekStart("2026-10-05")).toBe("2026-10-05");
    expect(parseWeekStart(" 2026-10-09 ")).toBe("2026-10-05");
    expect(parseWeekStart("2026-10-11")).toBe("2026-10-05");
  });

  it("biçimsiz/var olmayan/metin olmayan girdi invalid_input", () => {
    for (const bad of ["2026-02-31", "bugün", "", "2026-10", 20261005, null, undefined]) {
      expect(() => parseWeekStart(bad), String(bad)).toThrowError(expect.objectContaining({ name: "RepositoryError", code: "invalid_input" }));
    }
  });
});
