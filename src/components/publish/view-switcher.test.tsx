// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ViewSwitcher } from "@/components/publish/view-switcher";

describe("ViewSwitcher dokunma hedefleri (D2-13)", () => {
  it("dar ekranda Liste / Hafta / Ay, oklar ve Bugün ≥ 48 px (min-h-tap)", () => {
    render(<ViewSwitcher view="ay" anchor="2026-10-05" today="2026-10-05" />);
    for (const name of ["Liste", "Hafta", "Ay", "Bugün"]) {
      expect(screen.getByRole("link", { name })).toHaveClass("min-h-tap");
    }
    for (const name of ["Önceki ay", "Sonraki ay"]) {
      expect(screen.getByRole("link", { name })).toHaveClass("min-h-tap", "min-w-tap");
    }
  });
});
