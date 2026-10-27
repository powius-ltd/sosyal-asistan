import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

import { updateContentLanguage } from "@/app/actions/content-language-settings";
import { getPanelContext } from "@/lib/data";
import { parseWorkspacePatch, workspacePatchSchema } from "@/lib/data/workspace-patch";
import { parseCreateArgs } from "@/lib/workspace/create-args";
import { createWorkspaceSchema } from "@/lib/workspace/create-input";

const base = { name: "Ornek Marka", handle: "@ornek.marka" };

describe("içerik dili: yama şeması", () => {
  it("tr ve en geçerli; null = ayarı kaldır (otomatik); verilmezse yamada yok", () => {
    expect(workspacePatchSchema.parse({ contentLanguage: "tr" }).contentLanguage).toBe("tr");
    expect(workspacePatchSchema.parse({ contentLanguage: "en" }).contentLanguage).toBe("en");
    expect(workspacePatchSchema.parse({ contentLanguage: null }).contentLanguage).toBeNull();
    expect("contentLanguage" in workspacePatchSchema.parse({})).toBe(false);
  });

  it("desteklenmeyen dil, boş metin, büyük harf ve sayı reddedilir (Türkçe mesaj)", () => {
    for (const bad of ["de", "", "TR", "tr-TR", 5]) {
      const result = workspacePatchSchema.safeParse({ contentLanguage: bad });
      expect(result.success, String(bad)).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("İçerik dili tr ya da en olmalı.");
    }
  });

  it("depo doğrulayıcısı geçersiz dili invalid_input olarak fırlatır", () => {
    expect(() => parseWorkspacePatch({ contentLanguage: "de" })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
});

describe("içerik dili: çalışma alanı oluşturma girdisi", () => {
  it("verilmezse ya da boşsa ayarlanmaz (otomatik); tr/en kabul edilir", () => {
    expect(createWorkspaceSchema.parse(base).contentLanguage).toBeUndefined();
    expect(createWorkspaceSchema.parse({ ...base, contentLanguage: "" }).contentLanguage).toBeUndefined();
    expect(createWorkspaceSchema.parse({ ...base, contentLanguage: "  " }).contentLanguage).toBeUndefined();
    expect(createWorkspaceSchema.parse({ ...base, contentLanguage: "tr" }).contentLanguage).toBe("tr");
    expect(createWorkspaceSchema.parse({ ...base, contentLanguage: "en" }).contentLanguage).toBe("en");
  });

  it("geçersiz dil Türkçe mesajla reddedilir", () => {
    const result = createWorkspaceSchema.safeParse({ ...base, contentLanguage: "fr" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("İçerik dili tr ya da en olmalı.");
  });

  it("betik bayrağı --lang şema alanına eşlenir", () => {
    expect(parseCreateArgs(["--name=Ornek Marka", "--handle=ornek.marka", "--lang=tr"])).toEqual({ name: "Ornek Marka", handle: "ornek.marka", contentLanguage: "tr" });
    expect(() => parseCreateArgs(["--lang=tr", "--lang=en"])).toThrowError(/bir kez/);
  });
});

describe("updateContentLanguage (mock depo)", () => {
  beforeEach(async () => {
    const { repo, wsId } = await getPanelContext();
    await repo.updateWorkspace(wsId, { contentLanguage: null });
    revalidatePath.mockClear();
  });

  async function saved() {
    const { repo, wsId } = await getPanelContext();
    return (await repo.getWorkspace(wsId))?.contentLanguage;
  }

  it("dili kaydeder, Otomatik (null) ayarı kaldırır; Ayarlar yenilenir", async () => {
    expect(await saved()).toBeUndefined();
    expect(await updateContentLanguage({ contentLanguage: "tr" })).toEqual({ ok: true });
    expect(await saved()).toBe("tr");
    expect(revalidatePath).toHaveBeenCalledWith("/ayarlar");
    expect(await updateContentLanguage({ contentLanguage: "en" })).toEqual({ ok: true });
    expect(await saved()).toBe("en");
    expect(await updateContentLanguage({ contentLanguage: null })).toEqual({ ok: true });
    expect(await saved()).toBeUndefined();
  });

  it("geçersiz girdi depoya gitmeden reddedilir; seçim zorunlu (boş girdi)", async () => {
    await updateContentLanguage({ contentLanguage: "tr" });
    revalidatePath.mockClear();
    for (const input of [{ contentLanguage: "de" }, { contentLanguage: "" }, null, "tr"]) {
      expect((await updateContentLanguage(input)).ok, JSON.stringify(input)).toBe(false);
    }
    expect(await updateContentLanguage({})).toMatchObject({ ok: false, message: "İçerik dilini seç." });
    expect(await saved()).toBe("tr");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
