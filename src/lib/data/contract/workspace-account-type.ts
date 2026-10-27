/**
 * Sözleşme parçası: workspace hesap türü (`Workspace.accountType`, `updateWorkspace({ accountType })`). Değer business/creator/mixed; okuma HER ZAMAN
 * dolu bir tür döner (kaldırılamaz: `null` geçersiz); verilmeyen alan değişmez; desteklenmeyen değer `invalid_input`. Temizlik: özgün türe geri yazılır.
 */
import { expect, it } from "vitest";

import { ACCOUNT_TYPES, isAccountType, type AccountType } from "@/lib/domain/account-type";
import { expectCode, type ContractContext } from "@/lib/data/contract/support";

export function workspaceAccountTypeContract(ctx: ContractContext): void {
  const { wsId, create } = ctx;

  it("workspace hesap türü: okuma dolu ve geçerli; ayarla, değiştir; diğer alanlar ve verilmeyen alan değişmez; geçersiz değer ve null invalid_input", async () => {
    const r = create();
    const before = await r.getWorkspace(wsId);
    if (!before) throw new Error("seed: workspace yok");
    expect(isAccountType(before.accountType), "tür her zaman dolu ve geçerli").toBe(true);
    try {
      for (const type of ACCOUNT_TYPES) {
        const updated = await r.updateWorkspace(wsId, { accountType: type });
        expect(updated).toMatchObject({ accountType: type, nicheBrief: before.nicheBrief, complianceRegion: before.complianceRegion });
        expect(updated.contentLanguage, "başka alan değişmez").toBe(before.contentLanguage);
        expect((await r.getWorkspace(wsId))?.accountType).toBe(type);
      }
      const current = (await r.getWorkspace(wsId))?.accountType;
      expect((await r.updateWorkspace(wsId, { nicheBrief: before.nicheBrief ?? "" })).accountType, "verilmeyen alan değişmez").toBe(current);
      for (const bad of ["agency", "Creator", "", null, 1, ["creator"]]) {
        await expectCode(r.updateWorkspace(wsId, { accountType: bad as unknown as AccountType }), "invalid_input");
      }
      expect((await r.getWorkspace(wsId))?.accountType, "reddedilen değer uygulanmaz").toBe(current);
    } finally {
      await r.updateWorkspace(wsId, { accountType: before.accountType });
    }
    expect((await r.getWorkspace(wsId))?.accountType).toBe(before.accountType);
  });
}
