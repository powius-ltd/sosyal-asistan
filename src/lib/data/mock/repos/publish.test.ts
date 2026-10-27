import { describe, expect, it } from "vitest";

import { mockWorkspaceHasZernioKey } from "@/lib/data/mock/repos/publish";
import { workspaceHasZernioKey } from "@/lib/publish/publishable";

describe("mock workspaceHasZernioKey · Supabase ile aynı kural (Y7)", () => {
  it("slug yoksa anahtar yok sayılır; slug verilince çalışma alanına özel anahtar aranır", () => {
    expect(mockWorkspaceHasZernioKey({})).toBe(false);
    expect(mockWorkspaceHasZernioKey({ ZERNIO_API_KEY_DENEME: "x" })).toBe(false);
    expect(mockWorkspaceHasZernioKey({ MOCK_WORKSPACE_SLUG: "deneme", ZERNIO_API_KEY_DENEME: "x" })).toBe(true);
    expect(mockWorkspaceHasZernioKey({ MOCK_WORKSPACE_SLUG: "deneme", ZERNIO_API_KEY: "genel" })).toBe(false);
    expect(mockWorkspaceHasZernioKey({ MOCK_WORKSPACE_SLUG: "ornekstudyoapp", ZERNIO_API_KEY: "genel" })).toBe(true);
  });
  it("Supabase yolundaki işlevle birebir aynı sonucu verir", () => {
    const env = { MOCK_WORKSPACE_SLUG: "deneme", ZERNIO_API_KEY_DENEME: "x" };
    expect(mockWorkspaceHasZernioKey(env)).toBe(workspaceHasZernioKey("deneme", env));
  });
});
