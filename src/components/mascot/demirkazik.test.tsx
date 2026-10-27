// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Demirkazik } from "@/components/mascot/demirkazik";
import { MASCOT_STATES, MASCOT_STATE_LABEL, voiceMascotState } from "@/lib/mascot/state";

describe("Demirkazik", () => {
  it("dört durumun her biri ayrı bir çizim verir; hareket sınıfı yalnız durumuna aittir", () => {
    const hooks: Record<string, string> = { waiting: ".mk-breathe", thinking: ".mk-turn", telling: ".mk-wave", turn: ".mk-pulse" };
    for (const state of MASCOT_STATES) {
      const { container, unmount } = render(<Demirkazik state={state} />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("data-state", state);
      expect(svg?.querySelector(hooks[state])).not.toBeNull();
      for (const [other, selector] of Object.entries(hooks)) if (other !== state) expect(svg?.querySelector(selector)).toBeNull();
      unmount();
    }
  });

  it("ad verilmezse süstür (ekran okuyucudan gizli); ad verilirse durumunu söyler", () => {
    const { container, rerender } = render(<Demirkazik state="waiting" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    rerender(<Demirkazik state="turn" name="Demirkazık" />);
    expect(screen.getByRole("img", { name: `Demirkazık ${MASCOT_STATE_LABEL.turn}` })).toBeInTheDocument();
  });

  it("renk yalnız belirteçten: sabit renk özniteliği yok", () => {
    const { container } = render(<Demirkazik state="turn" />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|oklch/i);
  });
});

describe("voiceMascotState", () => {
  it("iş sürüyorsa düşünüyor; karar varsa anlatıyor; yoksa bekliyor", () => {
    expect(voiceMascotState({ decisions: 3, busy: true })).toBe("thinking");
    expect(voiceMascotState({ decisions: 3, busy: false })).toBe("telling");
    expect(voiceMascotState({ decisions: 0, busy: false })).toBe("waiting");
  });
});
