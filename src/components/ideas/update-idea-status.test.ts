import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, updateIdeaStatus } = vi.hoisted(() => ({ revalidatePath: vi.fn(), updateIdeaStatus: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/data", async () => {
  const { RepositoryError } = await import("@/lib/data/repository");
  return {
    RepositoryError,
    getPanelContext: async () => ({ repo: { updateIdeaStatus }, wsId: "ws_test" }),
  };
});

const { updateIdeaStatusAction } = await import("@/app/actions/ideas");
const { RepositoryError } = await import("@/lib/data/repository");

beforeEach(() => {
  revalidatePath.mockReset();
  updateIdeaStatus.mockReset();
});

describe("updateIdeaStatusAction", () => {
  it("geçerli girdide depoyu workspace ile çağırır ve sayfayı yeniden doğrular", async () => {
    updateIdeaStatus.mockResolvedValue({ id: "id_1", status: "saved" });
    const result = await updateIdeaStatusAction({ ideaId: " id_1 ", status: "saved" });

    expect(updateIdeaStatus).toHaveBeenCalledWith("ws_test", "id_1", "saved");
    expect(revalidatePath).toHaveBeenCalledWith("/fikirler");
    expect(result).toEqual({ ok: true, ideaId: "id_1", status: "saved" });
  });

  it("geçersiz girdiyi depoya ulaşmadan reddeder", async () => {
    for (const bad of [null, {}, { ideaId: "", status: "saved" }, { ideaId: "id_1", status: "bilinmeyen" }]) {
      const result = await updateIdeaStatusAction(bad);
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(updateIdeaStatus).not.toHaveBeenCalled();
  });

  it("invalid_state hatasını Türkçe mesaja çevirir ve ekranı yeniler", async () => {
    updateIdeaStatus.mockRejectedValue(new RepositoryError("invalid_state", "Fikir durumu published → new olamaz."));
    const result = await updateIdeaStatusAction({ ideaId: "id_1", status: "new" });

    expect(result).toMatchObject({ ok: false, code: "invalid_state" });
    expect(result.ok === false && result.message).toContain("izin verilmiyor");
    expect(revalidatePath).toHaveBeenCalledWith("/fikirler");
  });

  it("not_found hatasını Türkçe mesaja çevirir", async () => {
    updateIdeaStatus.mockRejectedValue(new RepositoryError("not_found", "Fikir bulunamadı: x"));
    const result = await updateIdeaStatusAction({ ideaId: "x", status: "saved" });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });

  it("beklenmeyen hatada ayrıntı sızdırmadan genel mesaj döner", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    updateIdeaStatus.mockRejectedValue(new Error("veritabanı parolası: hunter2"));
    const result = await updateIdeaStatusAction({ ideaId: "id_1", status: "saved" });

    expect(result).toMatchObject({ ok: false, code: "unknown" });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    spy.mockRestore();
  });
});
