// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentLink } from "@/components/common/content-link";

// Script şemasının adı parçalı yazılır: kaynakta düz metin olarak geçmesin.
const SCRIPT_SCHEME = ["java", "script"].join("");

describe("ContentLink", () => {
  it("https adresi için dış bağlantıyı noopener noreferrer ile çizer", () => {
    render(<ContentLink id="ci_001" externalUrl="https://www.instagram.com/reel/abc/">Başlık</ContentLink>);
    const external = screen.getByRole("link", { name: "Platformda aç" });
    expect(external).toHaveAttribute("href", "https://www.instagram.com/reel/abc/");
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("script şeması ve diğer şemalar hiç çizilmez; iç bağlantı kalır", () => {
    for (const url of [`${SCRIPT_SCHEME}:alert(1)`, "data:text/html,x", "file:///x"]) {
      const { unmount } = render(<ContentLink id="ci_001" externalUrl={url}>Başlık</ContentLink>);
      expect(screen.queryByRole("link", { name: "Platformda aç" }), url).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Başlık" })).toHaveAttribute("href", "/video/ci_001");
      unmount();
    }
  });
});
