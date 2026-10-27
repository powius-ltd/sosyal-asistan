/**
 * Çalışma alanı action'ları (operatör modu): action doğrudan POST ile çağrılabildiği için mod, girdi doğrulaması ve kayıt denetimi
 * sunucuda yapılır. Çerez, kayıt ve önbellek sahtedir (ağ yok).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { writeWorkspaceCookie, listWorkspaces, createWorkspace, revalidatePath } = vi.hoisted(() => ({
  writeWorkspaceCookie: vi.fn(async () => undefined),
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/workspace/cookie", () => ({ writeWorkspaceCookie }));
vi.mock("@/lib/workspace/registry", () => ({ listWorkspaces, createWorkspace }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { createWorkspaceAndSwitch, switchWorkspace } from "@/app/actions/workspace";
import { RepositoryError } from "@/lib/data/repository";

const KNOWN = [
  { id: "7a3f0000-0000-4000-8000-000000000001", name: "Ornek", slug: "ornek", accounts: [] },
  { id: "5cc27bf7-635a-4e00-975a-d18122f8de30", name: "Kahve", slug: "kahve", accounts: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPERATOR_MODE", "");
  vi.stubEnv("VERCEL", "");
  listWorkspaces.mockResolvedValue(KNOWN);
  createWorkspace.mockResolvedValue({ id: KNOWN[1].id, name: "Kahve", slug: "kahve", accounts: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("switchWorkspace", () => {
  it("kayıtlı çalışma alanına geçer: çerez yazılır ve düzen yenilenir", async () => {
    const result = await switchWorkspace({ workspaceId: KNOWN[1].id });
    expect(result).toEqual({ ok: true });
    expect(writeWorkspaceCookie).toHaveBeenCalledExactlyOnceWith(KNOWN[1].id);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("kayıtta olmayan kimlik reddedilir; çerez yazılmaz", async () => {
    const result = await switchWorkspace({ workspaceId: "11111111-1111-4111-8111-111111111111" });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(writeWorkspaceCookie).not.toHaveBeenCalled();
  });

  it("geçersiz girdi (boş, eksik, metin dışı) reddedilir", async () => {
    for (const input of [{}, { workspaceId: "" }, { workspaceId: 5 }, null, "ornek"]) {
      expect(await switchWorkspace(input)).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(writeWorkspaceCookie).not.toHaveBeenCalled();
  });

  it("operatör modu kapalıyken (Vercel ya da OPERATOR_MODE=off) çerez YAZILMAZ, kayıt bile okunmaz", async () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    expect(await switchWorkspace({ workspaceId: KNOWN[1].id })).toMatchObject({ ok: false, code: "invalid_state" });
    vi.stubEnv("OPERATOR_MODE", "local");
    vi.stubEnv("VERCEL", "1");
    expect(await switchWorkspace({ workspaceId: KNOWN[1].id })).toMatchObject({ ok: false, code: "invalid_state" });
    expect(writeWorkspaceCookie).not.toHaveBeenCalled();
    expect(listWorkspaces).not.toHaveBeenCalled();
  });
});

describe("createWorkspaceAndSwitch", () => {
  it("geçerli girdiyle oluşturur, yeni çalışma alanına geçer", async () => {
    const result = await createWorkspaceAndSwitch({ name: "Kahve", handle: "@Kahve" });
    expect(result).toEqual({ ok: true, workspaceId: KNOWN[1].id, name: "Kahve", slug: "kahve" });
    expect(createWorkspace).toHaveBeenCalledWith(expect.objectContaining({ name: "Kahve", handle: "kahve", platform: "instagram" }));
    expect(writeWorkspaceCookie).toHaveBeenCalledExactlyOnceWith(KNOWN[1].id);
  });

  it("geçersiz girdi sunucuda zod ile reddedilir (Türkçe mesaj); hiçbir şey oluşturulmaz", async () => {
    const result = await createWorkspaceAndSwitch({ name: "Kahve", handle: "kötü ad" });
    expect(result).toMatchObject({ ok: false, code: "invalid_input", message: expect.stringMatching(/Kullanıcı adı/) });
    expect(createWorkspace).not.toHaveBeenCalled();
    expect(writeWorkspaceCookie).not.toHaveBeenCalled();
  });

  it("mock veri kaynağında not_implemented Türkçe mesajla döner; çerez yazılmaz", async () => {
    createWorkspace.mockRejectedValue(new RepositoryError("not_implemented", "x"));
    const result = await createWorkspaceAndSwitch({ name: "Kahve", handle: "kahve" });
    expect(result).toMatchObject({ ok: false, code: "not_implemented", message: expect.stringMatching(/mock/) });
    expect(writeWorkspaceCookie).not.toHaveBeenCalled();
  });

  it("operatör modu kapalıyken hiçbir şey oluşturulmaz", async () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    expect(await createWorkspaceAndSwitch({ name: "Kahve", handle: "kahve" })).toMatchObject({ ok: false, code: "invalid_state" });
    expect(createWorkspace).not.toHaveBeenCalled();
    expect(writeWorkspaceCookie).not.toHaveBeenCalled();
  });
});
