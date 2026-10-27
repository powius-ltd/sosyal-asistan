/**
 * Sözleşme parçası: workspace içerik dili (`Workspace.contentLanguage`, `updateWorkspace({ contentLanguage })`).
 * Değer tr/en; `null` ayarı kaldırır (otomatik: okuma `undefined` döner); verilmeyen alan değişmez; desteklenmeyen değer
 * `invalid_input`. Temizlik: her durumda özgün değere (ayarlı ya da ayarsız) geri yazılır.
 */
import { expect, it } from "vitest";

import { CONTENT_LANGUAGES, type ContentLanguage } from "@/lib/domain/content-language";
import { expectCode, type ContractContext } from "@/lib/data/contract/support";

export function workspaceLanguageContract(ctx: ContractContext): void {
  const { wsId, create } = ctx;

  it("workspace içerik dili: ayarla, değiştir, kaldır (null → undefined); diğer alanlar ve verilmeyen alan değişmez; geçersiz değer invalid_input", async () => {
    const r = create();
    const before = await r.getWorkspace(wsId);
    if (!before) throw new Error("seed: workspace yok");
    try {
      for (const language of CONTENT_LANGUAGES) {
        const updated = await r.updateWorkspace(wsId, { contentLanguage: language });
        expect(updated).toMatchObject({ contentLanguage: language, nicheBrief: before.nicheBrief, complianceRegion: before.complianceRegion, apifyMonthlyCapUsd: before.apifyMonthlyCapUsd });
        expect((await r.getWorkspace(wsId))?.contentLanguage).toBe(language);
      }
      const current = (await r.getWorkspace(wsId))?.contentLanguage;
      expect((await r.updateWorkspace(wsId, { nicheBrief: before.nicheBrief ?? "" })).contentLanguage, "verilmeyen alan değişmez").toBe(current);
      for (const bad of ["de", "TR", "", 1, ["tr"]]) {
        await expectCode(r.updateWorkspace(wsId, { contentLanguage: bad as ContentLanguage }), "invalid_input");
      }
      expect((await r.getWorkspace(wsId))?.contentLanguage, "reddedilen değer uygulanmaz").toBe(current);

      const cleared = await r.updateWorkspace(wsId, { contentLanguage: null });
      expect(cleared.contentLanguage, "null ayarı kaldırır").toBeUndefined();
      expect((await r.getWorkspace(wsId))?.contentLanguage).toBeUndefined();
    } finally {
      await r.updateWorkspace(wsId, { contentLanguage: before.contentLanguage ?? null });
    }
    expect((await r.getWorkspace(wsId))?.contentLanguage).toBe(before.contentLanguage);
  });
}
