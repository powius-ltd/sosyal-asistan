import { describe, expect, it } from "vitest";

import { audienceZone } from "@/lib/insights/audience-zone";

describe("audienceZone", () => {
  it("hedef kitle dilimi önceliklidir", () => {
    expect(audienceZone({ audienceTimeZone: "America/New_York", timezone: "Europe/Istanbul" })).toBe("America/New_York");
  });

  it("hedef kitle dilimi yoksa ya da boşsa çalışma alanı dilimi", () => {
    expect(audienceZone({ timezone: "Europe/Berlin" })).toBe("Europe/Berlin");
    expect(audienceZone({ audienceTimeZone: "  ", timezone: "Europe/Berlin" })).toBe("Europe/Berlin");
  });

  it("ikisi de yok ya da geçersizse varsayılan (İstanbul); bozuk ad çökertmez", () => {
    expect(audienceZone({})).toBe("Europe/Istanbul");
    expect(audienceZone({ audienceTimeZone: "Mars/Base", timezone: "Gezegen/Yok" })).toBe("Europe/Istanbul");
    expect(audienceZone({ audienceTimeZone: "Mars/Base", timezone: "America/New_York" })).toBe("America/New_York");
  });
});
