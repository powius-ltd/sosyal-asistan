// @vitest-environment jsdom
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { useTextEntryFocus } from "@/components/chat/use-text-entry-focus";

function Probe() {
  const focused = useTextEntryFocus();
  return (
    <>
      <output data-testid="state">{String(focused)}</output>
      <input aria-label="Ad" />
      <input type="checkbox" aria-label="Onay" />
      <textarea aria-label="Not" />
      <button type="button">Düğme</button>
    </>
  );
}

describe("useTextEntryFocus", () => {
  it("başlangıçta false", () => {
    const { result } = renderHook(() => useTextEntryFocus());
    expect(result.current).toBe(false);
  });

  it("yazı kutusu ve metin alanı odaktayken true; odak çıkınca ya da düğmeye geçince false", async () => {
    const user = userEvent.setup();
    render(<Probe />);
    const state = screen.getByTestId("state");
    await user.click(screen.getByRole("textbox", { name: "Ad" }));
    expect(state).toHaveTextContent("true");
    await user.click(screen.getByRole("button", { name: "Düğme" }));
    expect(state).toHaveTextContent("false");
    await user.click(screen.getByRole("textbox", { name: "Not" }));
    expect(state).toHaveTextContent("true");
    await user.tab();
    expect(state).toHaveTextContent("false");
  });

  it("onay kutusu klavye açmaz: false kalır", async () => {
    const user = userEvent.setup();
    render(<Probe />);
    await user.click(screen.getByRole("checkbox", { name: "Onay" }));
    expect(screen.getByTestId("state")).toHaveTextContent("false");
  });

  it("odaktaki yazı kutusu DOM'dan kalkarsa (focusout gelmese de) false'a döner", async () => {
    const user = userEvent.setup();
    function Removable({ show }: { show: boolean }) {
      const focused = useTextEntryFocus();
      return (
        <>
          <output data-testid="state">{String(focused)}</output>
          {show ? <input aria-label="Ad" /> : null}
        </>
      );
    }
    const view = render(<Removable show />);
    const input = screen.getByRole("textbox", { name: "Ad" });
    await user.click(input);
    expect(screen.getByTestId("state")).toHaveTextContent("true");
    // Tarayıcılar kaldırılan elemanda focusout göndermeyebilir: olayı yutan bir kaldırma taklidi.
    input.addEventListener("focusout", (event) => event.stopImmediatePropagation(), { capture: true });
    view.rerender(<Removable show={false} />);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("false"));
  });
});
