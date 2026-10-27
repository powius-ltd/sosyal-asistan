import { describe, expect, it } from "vitest";

import { first } from "@/lib/search-params";

describe("first", () => {
  it("tek değeri olduğu gibi, diziyi ilk elemanıyla döndürür", () => {
    expect(first("a")).toBe("a");
    expect(first(["a", "b"])).toBe("a");
    expect(first([])).toBeUndefined();
    expect(first(undefined)).toBeUndefined();
  });
});
