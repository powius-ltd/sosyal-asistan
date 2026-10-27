// @vitest-environment jsdom
/** Kural (D3-08): "Prompt olarak kopyala" müşteri görünümünde (OPERATOR_MODE=off ya da VERCEL) hiç çizilmez; yönetici görünümünde çizilir. */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/prompt/copy-prompt-menu", () => ({ CopyPromptMenu: () => <button type="button">Prompt olarak kopyala</button> }));

import { CopyPromptButton } from "@/components/prompt/copy-prompt-button";

const SOURCE = { kind: "content", contentId: "ci_1" } as const;

describe("CopyPromptButton (yönetici kapısı)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("yönetici modunda düğmeyi çizer", () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    render(<CopyPromptButton source={SOURCE} />);
    expect(screen.getByRole("button", { name: "Prompt olarak kopyala" })).toBeInTheDocument();
  });

  it("müşteri görünümünde (OPERATOR_MODE=off) hiçbir şey çizmez", () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    const { container } = render(<CopyPromptButton source={SOURCE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("barındırmada (VERCEL) hiçbir şey çizmez", () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    vi.stubEnv("VERCEL", "1");
    const { container } = render(<CopyPromptButton source={SOURCE} />);
    expect(container).toBeEmptyDOMElement();
  });
});
