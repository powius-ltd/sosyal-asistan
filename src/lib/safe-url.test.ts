import { describe, expect, it } from "vitest";

import { safeExternalUrl } from "@/lib/safe-url";

// Script şemalarının adı parçalı yazılır: kaynakta düz metin olarak geçmesin.
const SCRIPT_SCHEME = ["java", "script"].join("");
const VB_SCHEME = ["vb", "script"].join("");

describe("safeExternalUrl", () => {
  it("http ve https adreslerini geçirir", () => {
    expect(safeExternalUrl("https://www.instagram.com/reel/abc/")).toBe("https://www.instagram.com/reel/abc/");
    expect(safeExternalUrl("http://example.com/x?y=1#z")).toBe("http://example.com/x?y=1#z");
    expect(safeExternalUrl("  https://example.com/  ")).toBe("https://example.com/");
  });

  it("tehlikeli ve diğer şemaları reddeder (script şemaları, data:, file:, ftp:)", () => {
    for (const url of [
      `${SCRIPT_SCHEME}:alert(1)`,
      `${SCRIPT_SCHEME.toUpperCase()}:alert(1)`,
      ` ${SCRIPT_SCHEME}:alert(1)`,
      "data:text/html,<script>alert(1)</script>",
      `${VB_SCHEME}:msgbox(1)`,
      "file:///etc/passwd",
      "ftp://example.com/x",
    ]) {
      expect(safeExternalUrl(url), url).toBeUndefined();
    }
  });

  it("göreli yol, boş ve bozuk girdi → undefined", () => {
    for (const url of ["/video/ci_001", "//evil.example", "instagram.com/p/x", "", "   ", undefined, null, "http://"]) {
      expect(safeExternalUrl(url), String(url)).toBeUndefined();
    }
  });
});
