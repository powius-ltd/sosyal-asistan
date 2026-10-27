import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({ current: { available: true } as { available: boolean } }));
vi.mock("@/lib/agents/chat/availability", () => ({ chatAvailability: () => availability.current }));

import * as askSignal from "@/components/chat/ask-signal";
import { ChatDock } from "@/components/chat/chat-dock";
import { ChatDockSlot } from "@/components/chat/chat-dock-slot";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

beforeEach(() => {
  availability.current = { available: true };
  delete process.env.MASKOT_ADI;
});

describe("ChatDockSlot (sunucu yuvası)", () => {
  it("ortam uygun değilse (CLI yok, barındırılan ortam, anthropic_api saplaması) HİÇ çizilmez", async () => {
    availability.current = { available: false };
    expect(await ChatDockSlot()).toBeNull();
  });

  it("uygunsa istemci kutusunu Maskot adı ve hesap türüne göre hazır sorularla çizer; key = çalışma alanı (değişince konuşma sıfırlanır)", async () => {
    const element = await ChatDockSlot();
    expect(isValidElement(element)).toBe(true);
    if (!isValidElement<{ assistantName: string; starters: string[] }>(element)) return;
    expect(element.type).toBe(ChatDock);
    expect(element.key).toBe(MOCK_WORKSPACE_ID);
    expect(element.props.assistantName).toBe("Demirkazık");
    // Mock çalışma alanı işletme türünde ve izlenen rakibi var.
    expect(element.props.starters).toEqual(["Bu hafta ne çekmeliyim?", "Rakiplerde tutan, bende eksik olan ne?", "Son videom nasıl gitti?", "En iyi videom nasıl gitti?"]);
  });

  it("bekleyen karar sayısı attention olarak geçer (Bugün kuyruğuyla aynı sayı); okunamazsa undefined", async () => {
    const { loadTodayData } = await import("@/components/today/today-data");
    const today = await loadTodayData();
    const element = await ChatDockSlot();
    expect(isValidElement<{ attention: number | undefined }>(element) && element.props.attention).toBe(today.today.queue.length);
    expect(today.today.queue.length).toBeGreaterThan(0);

    vi.spyOn(askSignal, "loadAskSignal").mockResolvedValue(undefined);
    const unreadable = await ChatDockSlot();
    expect(isValidElement<{ attention: number | undefined }>(unreadable) && unreadable.props.attention).toBeUndefined();
    vi.restoreAllMocks();
  });

  it("ortam uygun değilse Bugün hiç okunmaz", async () => {
    availability.current = { available: false };
    const spy = vi.spyOn(askSignal, "loadAskSignal");
    expect(await ChatDockSlot()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("Maskot adı MASKOT_ADI ortam değişkeninden gelir", async () => {
    process.env.MASKOT_ADI = "Bora";
    const element = await ChatDockSlot();
    expect(isValidElement<{ assistantName: string }>(element) && element.props.assistantName).toBe("Bora");
  });
});
