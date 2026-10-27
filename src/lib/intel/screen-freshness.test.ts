import { describe, expect, it } from "vitest";

import type { ScreenInfo } from "@/lib/intel/content-load";
import { dropStaleScreens } from "@/lib/intel/screen-freshness";

describe("dropStaleScreens", () => {
  it("güncel sürüm kalır; eski ya da sürümsüz kayıt atılır (yeniden elenir)", () => {
    const screens = new Map<string, ScreenInfo>([
      ["new", { inNiche: true, promptVersion: "screen-topics-v2" }],
      ["old", { inNiche: false, promptVersion: "screen-topics-v1" }],
      ["unknown", { inNiche: false }],
    ]);
    const { screens: fresh, stale } = dropStaleScreens(screens, "screen-topics-v2");
    expect([...fresh.keys()]).toEqual(["new"]);
    expect(stale).toBe(2);
    expect(screens.size).toBe(3); // girdi değişmez
  });
});
