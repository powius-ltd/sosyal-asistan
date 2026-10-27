import { describe, expect, it, vi } from "vitest";

import { readUnreadNotifications } from "@/components/shell/unread-count";

describe("readUnreadNotifications", () => {
  it("sayıyı olduğu gibi döndürür (0 gerçek sıfırdır)", async () => {
    expect(await readUnreadNotifications({ countUnreadNotifications: async () => 6 }, "ws")).toBe(6);
    expect(await readUnreadNotifications({ countUnreadNotifications: async () => 0 }, "ws")).toBe(0);
  });

  it("okuma hatasında fırlatmaz: undefined (rozet gizlenir, 0 gösterilmez) ve hata günlüğe yazılır", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = { countUnreadNotifications: vi.fn().mockRejectedValue(new Error("db kapalı")) };
    expect(await readUnreadNotifications(failing, "ws")).toBeUndefined();
    expect(failing.countUnreadNotifications).toHaveBeenCalledWith("ws");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
