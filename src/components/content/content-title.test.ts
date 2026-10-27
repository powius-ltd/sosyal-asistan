import { describe, expect, it } from "vitest";

import { contentTitle } from "@/components/content/content-title";

describe("contentTitle", () => {
  it("alt yazıyı kısaltır (kod noktası bazında), boşlukları sadeleştirir", () => {
    expect(contentTitle({ caption: "  Evde   V60\ndemleme ", externalId: "1" })).toBe("Evde V60 demleme");
    expect(contentTitle({ caption: "☕".repeat(10), externalId: "1" }, 4)).toBe("☕☕☕…");
  });

  it("alt yazı yoksa kısa kodu ya da dış kimliği kullanır", () => {
    expect(contentTitle({ shortcode: "C_abc", externalId: "1" })).toBe("İçerik C_abc");
    expect(contentTitle({ externalId: "12345" })).toBe("İçerik 12345");
    expect(contentTitle({ caption: "   ", externalId: "9" })).toBe("İçerik 9");
  });
});
