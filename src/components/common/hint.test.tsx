// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Hint } from "@/components/common/hint";

describe("Hint", () => {
  it("dokunuşla açılır (üzerine gelme olmadan) ve odak gidince kapanır", async () => {
    render(
      <Hint content="Platform bu sayıyı vermedi." label="Ölçülemedi">
        —
      </Hint>,
    );
    const trigger = screen.getByLabelText("Ölçülemedi");
    expect(screen.queryByText("Platform bu sayıyı vermedi.")).not.toBeInTheDocument();

    fireEvent.touchEnd(trigger);
    expect(await screen.findByText("Platform bu sayıyı vermedi.")).toBeInTheDocument();

    // Dokunuşun ardından gelen tıklama balonu kapatmaz.
    fireEvent.click(trigger);
    expect(screen.getByText("Platform bu sayıyı vermedi.")).toBeInTheDocument();

    fireEvent.blur(trigger);
    await waitFor(() => expect(screen.queryByText("Platform bu sayıyı vermedi.")).not.toBeInTheDocument());
  });

  it("tetikleyici klavyeyle odaklanır ve görünür odak halkası sınıfını taşır", () => {
    render(
      <Hint content="Neden ölçülemedi" label="Ölçülemedi">
        —
      </Hint>,
    );
    const trigger = screen.getByLabelText("Ölçülemedi");
    expect(trigger).toHaveAttribute("tabindex", "0");
    expect(trigger.className).toContain("focus-visible:ring");
    expect(trigger.className).not.toMatch(/(^|\s)outline-none(\s|$)(?!.*focus-visible:ring)/);
  });
});
