import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, linkIdeaToReel, resolveIdeaLink, unlinkIdea } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  linkIdeaToReel: vi.fn(),
  resolveIdeaLink: vi.fn(),
  unlinkIdea: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/data", async () => {
  const { RepositoryError } = await import("@/lib/data/repository");
  return {
    RepositoryError,
    getPanelContext: async () => ({ repo: { linkIdeaToReel, resolveIdeaLink, unlinkIdea }, wsId: "ws_test" }),
  };
});

const { linkIdeaToReelAction, resolveIdeaLinkAction, unlinkIdeaAction } = await import("@/app/actions/idea-links");
const { RepositoryError } = await import("@/lib/data/repository");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("linkIdeaToReelAction", () => {
  it("geçerli girdiyi kırpar, workspace ile depoya iletir ve ilgili ekranları yeniler", async () => {
    linkIdeaToReel.mockResolvedValue({ id: "l1", ideaId: "i1", status: "confirmed" });
    const result = await linkIdeaToReelAction({ ideaId: " i1 ", url: "  https://www.instagram.com/reel/ABC123/  " });
    expect(linkIdeaToReel).toHaveBeenCalledWith("ws_test", { ideaId: "i1", url: "https://www.instagram.com/reel/ABC123/" });
    expect(result).toEqual({ ok: true, ideaId: "i1", status: "confirmed" });
    expect(revalidatePath).toHaveBeenCalledWith("/fikirler");
    expect(revalidatePath).toHaveBeenCalledWith("/bu-hafta");
  });

  it("geçersiz girdiyi (boş bağlantı, eksik kimlik, aşırı uzun bağlantı, sayı) depoya gitmeden Türkçe mesajla reddeder", async () => {
    const cases: unknown[] = [null, {}, { ideaId: "i1", url: "   " }, { ideaId: "", url: "https://x.test" }, { ideaId: "i1", url: "u".repeat(5000) }, { ideaId: 5, url: "x" }];
    for (const bad of cases) {
      const result = await linkIdeaToReelAction(bad);
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
      expect(result.ok === false && result.message).toMatch(/[a-zçğıöşü]/i);
    }
    expect(linkIdeaToReel).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("tanınmayan bağlantı (depo invalid_input) mesajını olduğu gibi iletir; elenmiş fikir ve çifte onay Türkçe karşılık alır", async () => {
    linkIdeaToReel.mockRejectedValueOnce(new RepositoryError("invalid_input", "Geçerli bir Instagram içerik bağlantısı yapıştır (Reels ya da gönderi adresi)."));
    const bad = await linkIdeaToReelAction({ ideaId: "i1", url: "https://example.com" });
    expect(bad).toMatchObject({ ok: false, code: "invalid_input", message: "Geçerli bir Instagram içerik bağlantısı yapıştır (Reels ya da gönderi adresi)." });

    linkIdeaToReel.mockRejectedValueOnce(new RepositoryError("invalid_state", "x"));
    expect(await linkIdeaToReelAction({ ideaId: "i1", url: "https://www.instagram.com/reel/ABC/" })).toMatchObject({ ok: false, code: "invalid_state", message: expect.stringContaining("elenmiş fikre") });

    linkIdeaToReel.mockRejectedValueOnce(new RepositoryError("already_exists", "x"));
    expect(await linkIdeaToReelAction({ ideaId: "i1", url: "https://www.instagram.com/reel/ABC/" })).toMatchObject({ ok: false, code: "already_exists", message: expect.stringContaining("kaldır") });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("resolveIdeaLinkAction", () => {
  it("yalnız confirm/reject kabul eder; geçerli kararı depoya iletir", async () => {
    resolveIdeaLink.mockResolvedValue({ id: "l1", status: "confirmed" });
    expect(await resolveIdeaLinkAction({ linkId: "l1", decision: "confirm" })).toEqual({ ok: true, linkId: "l1", status: "confirmed" });
    expect(resolveIdeaLink).toHaveBeenCalledWith("ws_test", "l1", "confirm");
    for (const bad of [null, { linkId: "l1" }, { linkId: "l1", decision: "approve" }, { linkId: "", decision: "reject" }]) {
      expect(await resolveIdeaLinkAction(bad)).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(resolveIdeaLink).toHaveBeenCalledTimes(1);
  });
});

describe("unlinkIdeaAction", () => {
  it("geçerli kimliği iletir, boşu reddeder; bağı olmayan fikir için Türkçe mesaj verir", async () => {
    unlinkIdea.mockResolvedValue({ id: "i1" });
    expect(await unlinkIdeaAction({ ideaId: "i1" })).toEqual({ ok: true, ideaId: "i1" });
    expect(unlinkIdea).toHaveBeenCalledWith("ws_test", "i1");
    expect(await unlinkIdeaAction({ ideaId: " " })).toMatchObject({ ok: false, code: "invalid_input" });
    unlinkIdea.mockRejectedValueOnce(new RepositoryError("not_found", "x"));
    expect(await unlinkIdeaAction({ ideaId: "i1" })).toMatchObject({ ok: false, code: "not_found", message: expect.stringContaining("Reels bağı yok") });
  });
});
