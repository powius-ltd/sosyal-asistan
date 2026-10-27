import { describe, expect, it } from "vitest";

import { truncateText } from "@/lib/text";

describe("truncateText", () => {
  it("kısa metni olduğu gibi bırakır, boşlukları ve satır sonlarını sadeleştirir", () => {
    expect(truncateText("  Evde   V60\ndemleme ", 40)).toBe("Evde V60 demleme");
  });

  it("uzun metni … ile keser ve sınırı aşmaz", () => {
    const out = truncateText("a".repeat(100), 10);
    expect(out).toBe(`${"a".repeat(9)}…`);
    expect(Array.from(out)).toHaveLength(10);
  });

  it("emojiyi ikiye bölmez (kod noktası bazında)", () => {
    expect(truncateText("☕☕☕☕☕☕", 4)).toBe("☕☕☕…");
    expect(truncateText("😀😀😀😀😀😀", 4)).toBe("😀😀😀…");
  });
});
