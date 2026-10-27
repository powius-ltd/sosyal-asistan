// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DayStrip } from "@/components/home/day-strip";
import type { DayStrip as DayStripModel } from "@/lib/home/day-strip";

const STRIP: DayStripModel = {
  unplaced: 0,
  days: [
    { key: "2026-10-12", weekday: "Pzt", dayNumber: 12, items: [], isNext: false },
    { key: "2026-10-13", weekday: "Sal", dayNumber: 13, items: [{ ideaId: "i1", title: "Bir fikir", time: "21:00", status: "next", statusLabel: "Sıradaki" }], isNext: true },
  ],
};

describe("DayStrip erişilebilirliği", () => {
  it("boş gün rolsüz etiket taşımaz: etiketli bir grup olarak okunur", () => {
    const { container } = render(<DayStrip strip={STRIP} />);
    expect(screen.getByRole("group", { name: "Pzt 12, boş gün" })).toBeInTheDocument();
    // Etiketli her eleman bir rol taşır (rolsüz div'de aria-label yok sayılır).
    for (const el of container.querySelectorAll("[aria-label]")) expect(el.getAttribute("role")).not.toBeNull();
  });
});
