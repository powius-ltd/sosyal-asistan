import { describe, expect, it } from "vitest";

import { parseWorkspacePatch, workspacePatchSchema } from "@/lib/data/workspace-patch";
import { parseCreateArgs, parseSetArgs } from "@/lib/workspace/create-args";
import { createWorkspaceSchema, workspaceSettingsSchema } from "@/lib/workspace/create-input";

describe("hesap türü: workspace yaması", () => {
  it("üç tür kabul; verilmeyen alan yamada yok; null ve geçersiz değer reddedilir (tür kaldırılamaz)", () => {
    for (const type of ["business", "creator", "mixed"]) expect(workspacePatchSchema.parse({ accountType: type }).accountType).toBe(type);
    expect("accountType" in workspacePatchSchema.parse({})).toBe(false);
    for (const bad of [null, "agency", "Creator", "", 1, ["creator"]]) {
      expect(workspacePatchSchema.safeParse({ accountType: bad }).success, JSON.stringify(bad)).toBe(false);
    }
    expect(() => parseWorkspacePatch({ accountType: "agency" })).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(workspacePatchSchema.safeParse({ accountType: "x" }).error?.issues[0]?.message).toMatch(/Hesap türü/);
  });
});

describe("hesap türü: çalışma alanı oluşturma", () => {
  const base = { name: "Ornek Marka", handle: "ornek.marka" };

  it("verilmezse ya da boşsa işletme; geçerli türler kabul; bozuk değer Türkçe mesajla reddedilir", () => {
    expect(createWorkspaceSchema.parse(base).accountType).toBe("business");
    expect(createWorkspaceSchema.parse({ ...base, accountType: "" }).accountType).toBe("business");
    expect(createWorkspaceSchema.parse({ ...base, accountType: "  " }).accountType).toBe("business");
    for (const type of ["business", "creator", "mixed"]) expect(createWorkspaceSchema.parse({ ...base, accountType: type }).accountType).toBe(type);
    const result = createWorkspaceSchema.safeParse({ ...base, accountType: "agency" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/Hesap türü/);
  });

  it("--type bayrağı accountType alanına eşlenir", () => {
    expect(parseCreateArgs(["--name=Ornek Marka", "--handle=ornekmarka", "--type=creator"])).toEqual({ name: "Ornek Marka", handle: "ornekmarka", accountType: "creator" });
    expect(() => parseCreateArgs(["--type=a", "--type=b"])).toThrowError(/bir kez/);
  });
});

describe("workspace set (yalnız tür ve/veya dil)", () => {
  it("--type ve --lang ayrışır; başka bayrak (ad, niş, bölge …) reddedilir", () => {
    expect(parseSetArgs(["--type=creator"])).toEqual({ accountType: "creator" });
    expect(parseSetArgs(["--type=mixed", "--lang=tr"])).toEqual({ accountType: "mixed", contentLanguage: "tr" });
    for (const flag of ["--name=x", "--niche=x", "--region=TR", "--handle=x", "--tz=Europe/Istanbul", "x"]) {
      expect(() => parseSetArgs([flag]), flag).toThrowError(/Bilinmeyen bayrak/);
    }
    expect(() => parseSetArgs(["--type=a", "--type=b"])).toThrowError(/bir kez/);
  });

  it("şema: tür ve/veya dil doğrulanır; hiçbiri verilmezse ya da geçersizse reddedilir", () => {
    expect(workspaceSettingsSchema.parse({ accountType: "creator" })).toEqual({ accountType: "creator" });
    expect(workspaceSettingsSchema.parse({ accountType: "mixed", contentLanguage: "en" })).toEqual({ accountType: "mixed", contentLanguage: "en" });
    expect(workspaceSettingsSchema.parse({ contentLanguage: "tr" })).toEqual({ contentLanguage: "tr" });
    expect(workspaceSettingsSchema.safeParse({}).success, "en az bir alan").toBe(false);
    expect(workspaceSettingsSchema.safeParse({ accountType: "" }).success, "boş değer verilmedi sayılır → en az bir alan").toBe(false);
    expect(workspaceSettingsSchema.safeParse({ accountType: "agency" }).success).toBe(false);
    expect(workspaceSettingsSchema.safeParse({ contentLanguage: "de" }).success).toBe(false);
    expect(workspaceSettingsSchema.safeParse({ accountType: "creator", name: "x" }).success, "bilinmeyen alan reddedilir").toBe(false);
  });
});

describe("workspaceSettingsSchema: yönetici ajan ayarları (komut satırı metinleri)", () => {
  it("metin sayıya çevrilir ve sınırlar uygulanır", () => {
    expect(workspaceSettingsSchema.parse({ agentMonthlyCapUsd: "3", collectEveryDays: "14", collectVideoLimit: "25", rivalTarget: "3" })).toEqual({
      agentMonthlyCapUsd: 3, collectEveryDays: 14, collectVideoLimit: 25, rivalTarget: 3,
    });
    expect(workspaceSettingsSchema.parse({ agentMonthlyCapUsd: "0" })).toEqual({ agentMonthlyCapUsd: 0 });
    for (const bad of [{ agentMonthlyCapUsd: "-1" }, { agentMonthlyCapUsd: "1001" }, { collectEveryDays: "0" }, { collectEveryDays: "61" }, { collectVideoLimit: "4" }, { collectVideoLimit: "51" }, { rivalTarget: "11" }, { rivalTarget: "1.5" }, { agentMonthlyCapUsd: "abc" }]) {
      expect(workspaceSettingsSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
