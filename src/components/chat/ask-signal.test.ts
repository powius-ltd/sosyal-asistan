import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAskSignal } from "@/components/chat/ask-signal";
import * as todayData from "@/components/today/today-data";

afterEach(() => vi.restoreAllMocks());

describe("loadAskSignal: düğmedeki karar sayısı", () => {
  it("Bugün kuyruğunun uzunluğunu verir (aynı okuma, aynı sayı)", async () => {
    const data = await todayData.loadTodayData();
    expect(await loadAskSignal()).toBe(data.today.queue.length);
  });

  it("okuma fırlatırsa undefined döner (0 değil), panel çökmez", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(todayData, "loadTodayData").mockRejectedValue(new Error("okunamadı"));
    expect(await loadAskSignal()).toBeUndefined();
  });
});
