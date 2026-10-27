import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { workspaceDirName, workspaceDocDir } from "@/lib/workspace/doc-dir";

describe("workspaceDocDir", () => {
  const id = "5cc27bf7-635a-4e00-975a-d18122f8de30";

  it("slug varsa onu, yoksa kimliğin ilk 8 karakterini kullanır", () => {
    expect(workspaceDirName({ id, slug: "kahve" })).toBe("kahve");
    expect(workspaceDirName({ id })).toBe("5cc27bf7");
    expect(workspaceDirName({ id, slug: "  " })).toBe("5cc27bf7");
    expect(workspaceDirName({ id, slug: null })).toBe("5cc27bf7");
  });

  it("çıktı klasörü docs/<konu>/<çalışma alanı>: iki çalışma alanı aynı dosyayı ezmez", () => {
    expect(workspaceDocDir("/kok", "haftalik-plan", { id, slug: "kahve" })).toBe(join("/kok", "docs", "haftalik-plan", "kahve"));
    expect(workspaceDocDir("/kok", "rutin", { id, slug: "ornek" })).toBe(join("/kok", "docs", "rutin", "ornek"));
    expect(workspaceDocDir("/kok", "rutin", { id })).not.toBe(workspaceDocDir("/kok", "rutin", { id, slug: "ornek" }));
  });
});
