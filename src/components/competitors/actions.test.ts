import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, repo } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  repo: { addCompetitor: vi.fn(), setCompetitorStatus: vi.fn(), listOwnAccounts: vi.fn() },
}));

vi.mock("next/cache", () => ({ revalidatePath }));

vi.mock("@/lib/data", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/data")>();
  return { ...original, getPanelContext: async () => ({ repo, wsId: "ws_test" }) };
});

import { addCompetitorAction, setCompetitorStatusAction } from "@/app/actions/competitors";
import { RepositoryError } from "@/lib/data/repository";

beforeEach(() => {
  vi.clearAllMocks();
  repo.listOwnAccounts.mockResolvedValue([]);
});

/** Rakip eklemek/durumunu değiştirmek Rakipler, Keşfet, Tutanlar, Genel bakış ve Ayarlar'ı etkiler. */
function expectRevalidated() {
  const paths = [...new Set(revalidatePath.mock.calls.map((call) => call[0]))].sort();
  expect(paths).toEqual(["/", "/ayarlar", "/rakipler", "/rakipler/kesfet", "/tutanlar"]);
}

describe("addCompetitorAction", () => {
  it("handle'ı normalize edip depoya iletir ve sayfaları yeniler", async () => {
    repo.addCompetitor.mockResolvedValue({ id: "cp_1" });
    const result = await addCompetitorAction({ platform: "instagram", handle: "https://instagram.com/Yeni.Hesap/" });
    expect(result).toEqual({ ok: true, message: "@yeni.hesap takibe alındı." });
    expect(repo.addCompetitor).toHaveBeenCalledWith("ws_test", { platform: "instagram", handle: "yeni.hesap" });
    expectRevalidated();
  });

  it("kendi hesabını rakip olarak eklemeyi depoya gitmeden reddeder (D3-17)", async () => {
    repo.listOwnAccounts.mockResolvedValue([{ platform: "instagram", handle: "Benim.Hesap" }]);
    const result = await addCompetitorAction({ platform: "instagram", handle: "@benim.hesap" });
    expect(result).toMatchObject({ ok: false, message: "Bu senin kendi hesabın; rakip olarak eklenemez." });
    expect(repo.addCompetitor).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("already_exists ve budget_exceeded hatalarını Türkçe mesaja çevirir", async () => {
    repo.addCompetitor.mockRejectedValueOnce(new RepositoryError("already_exists", "dup"));
    expect(await addCompetitorAction({ platform: "instagram", handle: "@a" })).toEqual({
      ok: false,
      code: "already_exists",
      message: "@a zaten ekli.",
    });

    repo.addCompetitor.mockRejectedValueOnce(new RepositoryError("budget_exceeded", "cap"));
    const budget = await addCompetitorAction({ platform: "instagram", handle: "@b" });
    expect(budget.ok).toBe(false);
    expect(budget.message).toContain("bütçe tavanı");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("henüz desteklenmeyen platformu ve geçersiz handle'ı depoya gitmeden reddeder", async () => {
    expect((await addCompetitorAction({ platform: "tiktok", handle: "@a" })).ok).toBe(false);
    expect((await addCompetitorAction({ platform: "instagram", handle: "kahve yeri" })).ok).toBe(false);
    expect((await addCompetitorAction({ platform: "instagram" })).ok).toBe(false);
    expect((await addCompetitorAction("saçma")).ok).toBe(false);
    expect(repo.addCompetitor).not.toHaveBeenCalled();
  });

  it("beklenmeyen hatada ayrıntı sızdırmaz", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    repo.addCompetitor.mockRejectedValueOnce(new Error("db şifresi: hunter2"));
    const result = await addCompetitorAction({ platform: "instagram", handle: "@a" });
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("hunter2");
    spy.mockRestore();
  });
});

describe("setCompetitorStatusAction", () => {
  it("izle/yoksay/aday geçer; private ve not_found şema düzeyinde reddedilir", async () => {
    repo.setCompetitorStatus.mockResolvedValue({ id: "cp_1", handle: "kahve" });
    expect(await setCompetitorStatusAction({ competitorId: "cp_1", status: "tracked" })).toEqual({
      ok: true,
      message: "@kahve izlemeye alındı.",
    });
    expect(await setCompetitorStatusAction({ competitorId: "cp_1", status: "ignored" })).toEqual({
      ok: true,
      message: "@kahve yoksayıldı.",
    });
    expectRevalidated(); // iki başarılı çağrı sonrası (yenileme yolları tekrarlar, kümesi aynı)

    repo.setCompetitorStatus.mockClear();
    for (const status of ["private", "not_found", "hacked"]) {
      expect((await setCompetitorStatusAction({ competitorId: "cp_1", status })).ok).toBe(false);
    }
    expect((await setCompetitorStatusAction({ competitorId: "", status: "tracked" })).ok).toBe(false);
    expect(repo.setCompetitorStatus).not.toHaveBeenCalled();
  });

  it("depo hatasını Türkçe mesaja çevirir", async () => {
    repo.setCompetitorStatus.mockRejectedValueOnce(new RepositoryError("invalid_state", "x"));
    const result = await setCompetitorStatusAction({ competitorId: "cp_1", status: "tracked" });
    expect(result).toEqual({
      ok: false,
      code: "invalid_state",
      message: "Bu hesabın durumu değiştirilemez (gizli ya da bulunamadı olabilir).",
    });
  });
});
