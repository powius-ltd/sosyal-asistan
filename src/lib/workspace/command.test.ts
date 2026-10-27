import { describe, expect, it } from "vitest";

import { workspaceArgValue, workspaceCommand } from "@/lib/workspace/command";

describe("workspaceCommand", () => {
  const id = "7a3f0000-0000-4000-8000-000000000002";

  it("slug ile kurulur", () => {
    expect(workspaceCommand("collect:now", { id, slug: "ikinci-alan" })).toBe("npm run collect:now -- --workspace=ikinci-alan");
  });

  it("slug yoksa (ya da boşsa) tam kimlik", () => {
    expect(workspaceArgValue({ id })).toBe(id);
    expect(workspaceArgValue({ id, slug: "  " })).toBe(id);
    expect(workspaceCommand("rutin", { id, slug: null })).toBe(`npm run rutin -- --workspace=${id}`);
  });
});
