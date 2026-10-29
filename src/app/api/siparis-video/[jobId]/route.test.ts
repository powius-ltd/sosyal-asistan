import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ jobs: [] as unknown[] }));

vi.mock("@/lib/data", () => ({
  getPanelContext: async () => ({
    wsId: "ws1",
    repo: {
      listPublishJobs: async () => state.jobs,
      listOwnAccounts: async () => [{ id: "acc1", handle: "ornek.ozkan" }],
    },
  }),
}));
vi.mock("@/lib/workspace/registry", () => ({ listWorkspaces: async () => [{ id: "ws1", name: "A", slug: "ornek-ozkan", accounts: [] }] }));

import { GET } from "./route";

const call = (jobId: string, headers: Record<string, string> = {}) =>
  GET(new Request(`http://x/api/siparis-video/${jobId}`, { headers }), { params: Promise.resolve({ jobId }) });

describe("GET /api/siparis-video/[jobId]", () => {
  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), "siparis-"));
    vi.stubEnv("SIPARIS_KOK", root);
    mkdirSync(join(root, "ornek-ozkan", "h1", "s1"), { recursive: true });
    writeFileSync(join(root, "ornek-ozkan", "h1", "s1", "final.mp4"), "0123456789");
    state.jobs = [
      { id: "j1", socialAccountId: "acc1", mediaPath: "siparis:ornek-ozkan/h1/s1/final.mp4" },
      { id: "j2", socialAccountId: "acc1", mediaPath: "yerel/video.mp4" },
      { id: "j3", socialAccountId: "acc1", mediaPath: "siparis:baska-hesap/h1/s1/final.mp4" },
      { id: "j4", socialAccountId: "acc1", mediaPath: "siparis:ornek-ozkan/../../etc/passwd" },
    ];
  });

  it("kendi stüdyo videosunu Range ile akıtır", async () => {
    const res = await call("j1", { range: "bytes=0-3" });
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("0123");
  });

  it("bilinmeyen iş, stüdyo yolu olmayan yol, başka hesap ve yol dışı: 404", async () => {
    for (const id of ["yok", "j2", "j3", "j4"]) expect((await call(id)).status).toBe(404);
  });
});
