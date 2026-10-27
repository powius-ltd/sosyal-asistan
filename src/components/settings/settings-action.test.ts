import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, repo } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  repo: { updateWorkspace: vi.fn() },
}));

vi.mock("next/cache", () => ({ revalidatePath }));

vi.mock("@/lib/data", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/data")>();
  return { ...original, getPanelContext: async () => ({ repo, wsId: "ws_test" }) };
});

import { updateMeasureCap, updateWorkspaceSettings } from "@/app/actions/settings";
import { RepositoryError } from "@/lib/data/repository";

beforeEach(() => {
  vi.clearAllMocks();
  // Varsayılan: yönetici modu açık (yerel). Mod testleri kendi değerini verir.
  vi.stubEnv("OPERATOR_MODE", "local");
  vi.stubEnv("VERCEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateWorkspaceSettings", () => {
  it("geçerli yamayı workspace ile depoya iletir, Ayarlar ve Genel bakışı yeniler", async () => {
    repo.updateWorkspace.mockResolvedValue({});
    const result = await updateWorkspaceSettings({ apifyMonthlyCapUsd: 12.5, llmMonthlyCapUsd: 0, nicheBrief: "  kahve  " });
    expect(result).toEqual({ ok: true });
    expect(repo.updateWorkspace).toHaveBeenCalledWith("ws_test", { apifyMonthlyCapUsd: 12.5, llmMonthlyCapUsd: 0, nicheBrief: "kahve" });
    expect(revalidatePath).toHaveBeenCalledWith("/ayarlar");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("geçersiz girdiyi depoya gitmeden Türkçe mesajla reddeder", async () => {
    const cases: [unknown, RegExp][] = [
      [{ apifyMonthlyCapUsd: -1, nicheBrief: "" }, /negatif/],
      [{ llmMonthlyCapUsd: 1000.5, nicheBrief: "" }, /en fazla 1000/],
      [{ nicheBrief: "n".repeat(2001) }, /en fazla 2000/],
      [{ apifyMonthlyCapUsd: "5" }, /sayı/],
      [{ apifyMonthlyCapUsd: null }, /sayı/], // tavan kaldırılamaz
      [{ llmMonthlyCapUsd: null, nicheBrief: "" }, /sayı/],
    ];
    for (const [input, message] of cases) {
      const result = await updateWorkspaceSettings(input);
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
      expect(result.ok === false && result.message).toMatch(message);
    }
    expect((await updateWorkspaceSettings(null)).ok).toBe(false);
    expect(repo.updateWorkspace).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("depo hatasını Türkçe mesaja çevirir ve sayfayı yenilemez; beklenmeyen hatada ayrıntı sızdırmaz", async () => {
    repo.updateWorkspace.mockRejectedValueOnce(new RepositoryError("not_found", "ws yok"));
    expect(await updateWorkspaceSettings({ nicheBrief: "x" })).toMatchObject({ ok: false, code: "not_found" });

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    repo.updateWorkspace.mockRejectedValueOnce(new Error("db parolası: hunter2"));
    const result = await updateWorkspaceSettings({ nicheBrief: "x" });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    spy.mockRestore();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateMeasureCap", () => {
  it("tavanı yalnız ölçüm alanı olarak depoya iletir (onay = tavanı vermek) ve Ayarlar ile Bu hafta'yı yeniler", async () => {
    repo.updateWorkspace.mockResolvedValue({});
    expect(await updateMeasureCap({ measureMonthlyCapUsd: 0.5 })).toEqual({ ok: true });
    expect(repo.updateWorkspace).toHaveBeenCalledWith("ws_test", { measureMonthlyCapUsd: 0.5 });
    expect(revalidatePath).toHaveBeenCalledWith("/ayarlar");
    expect(revalidatePath).toHaveBeenCalledWith("/bu-hafta");
    // 0 geçerli ve onaylıdır (ölçüm kapalı).
    expect(await updateMeasureCap({ measureMonthlyCapUsd: 0 })).toEqual({ ok: true });
  });

  it("başka tavanları değiştirmez: fazlalık alanlar atılır", async () => {
    repo.updateWorkspace.mockResolvedValue({});
    await updateMeasureCap({ measureMonthlyCapUsd: 1, apifyMonthlyCapUsd: 999, nicheBrief: "x" });
    expect(repo.updateWorkspace).toHaveBeenCalledWith("ws_test", { measureMonthlyCapUsd: 1 });
  });

  it("tavan zorunlu: eksik, null, negatif, 1000'in üstü ve metin depoya gitmeden reddedilir", async () => {
    for (const bad of [null, {}, { measureMonthlyCapUsd: null }, { measureMonthlyCapUsd: -1 }, { measureMonthlyCapUsd: 1000.5 }, { measureMonthlyCapUsd: "1" }]) {
      expect(await updateMeasureCap(bad), JSON.stringify(bad)).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(repo.updateWorkspace).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("para tavanları yalnız yönetici modunda (sunucu denetimi)", () => {
  it("mod kapalıyken (OPERATOR_MODE=off ya da VERCEL) tavan içeren yama depoya gitmeden invalid_state ile reddedilir", async () => {
    for (const env of [{ OPERATOR_MODE: "off", VERCEL: "" }, { OPERATOR_MODE: "local", VERCEL: "1" }]) {
      vi.stubEnv("OPERATOR_MODE", env.OPERATOR_MODE);
      vi.stubEnv("VERCEL", env.VERCEL);
      for (const call of [
        () => updateWorkspaceSettings({ apifyMonthlyCapUsd: 1000 }),
        () => updateWorkspaceSettings({ llmMonthlyCapUsd: 0, nicheBrief: "kahve" }),
        () => updateWorkspaceSettings({ measureMonthlyCapUsd: 5 }),
        () => updateMeasureCap({ measureMonthlyCapUsd: 1000 }),
      ]) {
        const result = await call();
        expect(result).toMatchObject({ ok: false, code: "invalid_state" });
        expect(result.ok === false && result.message).toMatch(/yalnız yönetici modunda/);
      }
    }
    expect(repo.updateWorkspace).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("mod kapalıyken tavansız yama (niş) yine kaydedilir", async () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    repo.updateWorkspace.mockResolvedValue({});
    expect(await updateWorkspaceSettings({ nicheBrief: "kahve" })).toEqual({ ok: true });
    expect(repo.updateWorkspace).toHaveBeenCalledWith("ws_test", { nicheBrief: "kahve" });
  });

  it("yönetici modunda (OPERATOR_MODE=local) tavan kaydedilir", async () => {
    repo.updateWorkspace.mockResolvedValue({});
    expect(await updateMeasureCap({ measureMonthlyCapUsd: 2 })).toEqual({ ok: true });
    expect(repo.updateWorkspace).toHaveBeenCalledWith("ws_test", { measureMonthlyCapUsd: 2 });
  });
});
