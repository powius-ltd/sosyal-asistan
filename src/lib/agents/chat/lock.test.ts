import { describe, expect, it } from "vitest";

import { createChatLock } from "@/lib/agents/chat/lock";

describe("sohbet kilidi (çalışma alanı başına tek çağrı)", () => {
  it("aynı çalışma alanında ikinci istek reddedilir; bırakınca yeniden alınır", () => {
    const lock = createChatLock();
    const release = lock.acquire("ws_a");
    expect(release).toBeDefined();
    expect(lock.acquire("ws_a")).toBeUndefined();
    release?.();
    expect(lock.acquire("ws_a")).toBeDefined();
  });

  it("farklı çalışma alanları birbirini engellemez", () => {
    const lock = createChatLock();
    expect(lock.acquire("ws_a")).toBeDefined();
    expect(lock.acquire("ws_b")).toBeDefined();
  });

  it("bırakma işlevi birden çok çağrılabilir ve başkasının kilidini silmez", () => {
    let ms = 0;
    const lock = createChatLock({ ttlMs: 1_000, now: () => ms });
    const first = lock.acquire("ws_a");
    ms = 2_000; // ilk kilidin ömrü doldu
    const second = lock.acquire("ws_a");
    expect(second).toBeDefined();
    first?.(); // eski sahip geç bırakıyor: ikinci kilit etkilenmemeli
    expect(lock.acquire("ws_a")).toBeUndefined();
    second?.();
    second?.();
    expect(lock.acquire("ws_a")).toBeDefined();
  });

  it("takılı kalan kilit ömrü dolunca kendiliğinden düşer (asılı söz kilidi sonsuza dek tutmaz)", () => {
    let ms = 0;
    const lock = createChatLock({ ttlMs: 150_000, now: () => ms });
    expect(lock.acquire("ws_a")).toBeDefined();
    ms = 149_999;
    expect(lock.acquire("ws_a")).toBeUndefined();
    ms = 150_001;
    expect(lock.acquire("ws_a")).toBeDefined();
  });
});
