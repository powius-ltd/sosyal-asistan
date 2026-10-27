// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotifyMe } from "@/components/onboarding/notify-me";

class FakeNotification {
  static permission: NotificationPermission = "default";
  static answer: NotificationPermission = "granted";
  static requestPermission = vi.fn(async () => {
    FakeNotification.permission = FakeNotification.answer;
    return FakeNotification.answer;
  });
}

beforeEach(() => {
  FakeNotification.permission = "default";
  FakeNotification.answer = "granted";
  FakeNotification.requestPermission.mockClear();
  window.localStorage.clear();
  vi.stubGlobal("Notification", FakeNotification);
});

afterEach(() => vi.unstubAllGlobals());

describe("NotifyMe", () => {
  it("izin kendiliğinden istenmez; düğme ve dürüst sınır notu görünür", () => {
    render(<NotifyMe />);
    expect(screen.getByRole("button", { name: "Bitince haber ver" })).toBeInTheDocument();
    expect(screen.getByText(/yalnız bu sekme açıkken gelir/)).toBeInTheDocument();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it("düğmeye basınca izin sorulur; verilirse açık durumu yazar ve vazgeçilebilir", async () => {
    const user = userEvent.setup();
    render(<NotifyMe />);
    await user.click(screen.getByRole("button", { name: "Bitince haber ver" }));
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Bitince tarayıcıdan haber vereceğim."));
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByRole("button", { name: "Bitince haber ver" })).toBeInTheDocument();
  });

  it("izin reddedilirse düğme kaybolur, nedeni söylenir", async () => {
    FakeNotification.answer = "denied";
    const user = userEvent.setup();
    render(<NotifyMe />);
    await user.click(screen.getByRole("button", { name: "Bitince haber ver" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Bitince haber ver" })).not.toBeInTheDocument());
    expect(screen.getByText(/zilde bulursun/)).toBeInTheDocument();
  });

  it("daha önce reddedilmişse baştan düğme yok", () => {
    FakeNotification.permission = "denied";
    render(<NotifyMe />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/izin vermedin/)).toBeInTheDocument();
  });

  it("tarayıcı bildirimi desteklemiyorsa hiçbir şey çizilmez (sayfa bozulmaz)", () => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "Notification");
    const { container } = render(<NotifyMe />);
    expect(container).toBeEmptyDOMElement();
  });
});
