// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatLauncher, ChatLauncherStatus, LAUNCHER_ATTENTION_TEXT } from "@/components/chat/chat-launcher";
import type { MascotState } from "@/lib/mascot/state";

const renderLauncher = (mascot: MascotState, silent = false) =>
  render(
    <>
      <ChatLauncher label="Maskot'a sor" mascot={mascot} />
      <ChatLauncherStatus mascot={mascot} silent={silent} />
    </>,
  );
const button = () => screen.getByRole("button", { name: "Maskot'a sor" });

describe("ChatLauncher: yüzen düğme", () => {
  it("dört durumda Demirkazık o durumu çizer; ad ve açılır-pencere işareti her durumda aynı", () => {
    for (const state of ["waiting", "thinking", "telling", "turn"] as const) {
      const view = renderLauncher(state);
      expect(button().querySelector('[data-slot="mascot"]')).toHaveAttribute("data-state", state);
      expect(button()).toHaveAttribute("aria-haspopup", "dialog");
      view.unmount();
    }
  });

  it("müşteri kopyasında (plain) Demirkazık yok, düz sohbet ikonu var; ad ve açılır-pencere işareti aynı", () => {
    const { container } = render(<ChatLauncher label="Asistan'a sor" mascot="turn" plain />);
    const el = screen.getByRole("button", { name: "Asistan'a sor" });
    expect(el.querySelector('[data-slot="mascot"]')).toBeNull();
    expect(container.querySelector("svg.lucide-message-circle")).not.toBeNull();
    expect(el).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("sağ altta sabit: alt gezinme değişkenine bağlı, modal katmanların (z-50) altında (z-40), gece mavisi zemin", () => {
    renderLauncher("waiting");
    expect(button()).toHaveClass("fixed", "right-4", "z-40", "size-14", "rounded-full", "bg-focus-surface", "text-focus-ink");
    expect(button().className).toContain("var(--shell-bottom-nav)");
    expect(button().className).toContain("env(safe-area-inset-bottom)");
  });

  it("gece mavisi karar bloğunun üstüne gelince kaybolmasın: ince açık halka (belirteçten) ve gölge", () => {
    renderLauncher("waiting");
    expect(button()).toHaveClass("ring-2", "ring-focus-ink/80", "shadow-float");
  });

  it("sarı nokta (sıra sende) ekran okuyucuya AÇIKLAMA olarak okunur; diğer durumlarda açıklama yok", () => {
    const view = renderLauncher("turn");
    const describedBy = button().getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? "")).toHaveTextContent(LAUNCHER_ATTENTION_TEXT);
    view.unmount();
    renderLauncher("waiting");
    expect(button()).not.toHaveAttribute("aria-describedby");
  });

  it("canlı bölge yalnız yanıt hazırlanırken ve yeni yanıt gelince konuşur; sarı nokta ve sakin durum sessiz", () => {
    const said: Record<MascotState, string> = { waiting: "", turn: "", thinking: "Yanıt hazırlanıyor…", telling: "Yeni yanıt var" };
    for (const state of ["waiting", "thinking", "telling", "turn"] as const) {
      const view = renderLauncher(state);
      expect(screen.getByRole("status").textContent).toBe(said[state]);
      view.unmount();
    }
  });

  it("pencere açıkken (silent) canlı bölge susar: günlük zaten duyurur", () => {
    renderLauncher("thinking", true);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("gizlendiğinde (telefonda yazı alanı odakta) görünmez", () => {
    render(<ChatLauncher label="Maskot'a sor" mascot="waiting" concealed />);
    expect(button()).toHaveClass("hidden");
    expect(button()).not.toHaveClass("grid");
  });
});
