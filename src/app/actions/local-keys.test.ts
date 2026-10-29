import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data", () => ({ getPanelContext: async () => ({ wsId: "ws-1" }) }));
vi.mock("@/lib/workspace/registry", () => ({ listWorkspaces: async () => [{ id: "ws-1", name: "Ornek", slug: "ornek-hesap", accounts: [] }] }));

import { removeLocalKey, saveLocalKey, testLocalKey } from "@/app/actions/local-keys";

let dir: string;
let cwd: ReturnType<typeof vi.spyOn>;
const SECRET = "apify_api_SECRET9876";

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-keys-action-"));
  cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
});
afterEach(() => {
  cwd.mockRestore();
  vi.unstubAllEnvs();
  delete process.env.APIFY_TOKEN;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("anahtar action'ları", () => {
  it("kaydeder; sonuçta değer yok; geçici klasördeki dosyaya yazar", async () => {
    const result = await saveLocalKey({ service: "apify", value: SECRET });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(fs.readFileSync(path.join(dir, ".env.local"), "utf8")).toBe(`APIFY_TOKEN=${SECRET}\n`);
    expect(process.env.APIFY_TOKEN).toBe(SECRET);
  });

  it("VERCEL varken üç action da invalid_state döner, dosyaya dokunmaz", async () => {
    vi.stubEnv("VERCEL", "1");
    for (const result of [await saveLocalKey({ service: "apify", value: SECRET }), await removeLocalKey({ service: "apify" }), await testLocalKey({ service: "apify" })]) {
      expect(result).toMatchObject({ ok: false, code: "invalid_state" });
    }
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("serbest ad / fazladan alan / bilinmeyen servis reddedilir", async () => {
    expect(await saveLocalKey({ service: "PATH", value: SECRET })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await saveLocalKey({ service: "apify", value: SECRET, name: "X" })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await removeLocalKey({ service: "apify", extra: 1 })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("bozucu değerde invalid_input; kaldırma satırı siler", async () => {
    expect(await saveLocalKey({ service: "apify", value: "abc=def12345" })).toMatchObject({ ok: false, code: "invalid_input" });
    await saveLocalKey({ service: "apify", value: SECRET });
    expect((await removeLocalKey({ service: "apify" })).ok).toBe(true);
    expect(fs.readFileSync(path.join(dir, ".env.local"), "utf8")).toBe("");
  });
});
