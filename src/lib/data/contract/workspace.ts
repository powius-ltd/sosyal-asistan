/**
 * Sözleşme parçası: workspace ayarları (`updateWorkspace`). Kalıcı DB'de tekrar koşulabilsin diye
 * test sonunda özgün değerler geri yazılır. Tavan kaldırılamaz (`null` geçersiz); 0 = harcama kapalı.
 */
import { expect, it } from "vitest";

import { MAX_CAP_USD, NICHE_BRIEF_MAX_LENGTH, type WorkspacePatch } from "@/lib/data/queries";
import { expectCode, type ContractContext } from "@/lib/data/contract/support";

export function workspaceContract(ctx: ContractContext): void {
  const { wsId, create } = ctx;

  /** Geri yazılabilsin diye seed'de iki tavan da tanımlı olmalı (tavan kaldırılamaz, yalnız değiştirilir). */
  async function seedWorkspace(r: ReturnType<typeof create>) {
    const before = await r.getWorkspace(wsId);
    if (before?.apifyMonthlyCapUsd === undefined || before.llmMonthlyCapUsd === undefined) {
      throw new Error("seed: workspace'te Apify ve LLM aylık tavanı tanımlı olmalı");
    }
    return before as typeof before & { apifyMonthlyCapUsd: number; llmMonthlyCapUsd: number };
  }

  it("updateWorkspace: yalnız verilen alanları değiştirir; 0 geçerlidir (harcama kapalı), niş kırpılır", async () => {
    const r = create();
    const before = await seedWorkspace(r);
    try {
      const updated = await r.updateWorkspace(wsId, { apifyMonthlyCapUsd: 7.5, nicheBrief: "  Yeni niş tanımı  " });
      expect(updated).toMatchObject({ id: wsId, apifyMonthlyCapUsd: 7.5, nicheBrief: "Yeni niş tanımı", llmMonthlyCapUsd: before.llmMonthlyCapUsd });
      expect(await r.getWorkspace(wsId)).toEqual(updated);
      expect(await r.updateWorkspace(wsId, {})).toEqual(updated);
      expect((await r.updateWorkspace(wsId, { llmMonthlyCapUsd: 0 })).llmMonthlyCapUsd).toBe(0);
      expect((await r.updateWorkspace(wsId, { apifyMonthlyCapUsd: 0 })).apifyMonthlyCapUsd).toBe(0);
      expect((await r.updateWorkspace(wsId, { apifyMonthlyCapUsd: MAX_CAP_USD })).apifyMonthlyCapUsd).toBe(MAX_CAP_USD);
      expect((await r.updateWorkspace(wsId, { nicheBrief: "" })).nicheBrief).toBeUndefined();
      const longest = await r.updateWorkspace(wsId, { nicheBrief: "n".repeat(NICHE_BRIEF_MAX_LENGTH) });
      expect(longest.nicheBrief).toHaveLength(NICHE_BRIEF_MAX_LENGTH);
    } finally {
      await r.updateWorkspace(wsId, {
        apifyMonthlyCapUsd: before.apifyMonthlyCapUsd,
        llmMonthlyCapUsd: before.llmMonthlyCapUsd,
        nicheBrief: before.nicheBrief ?? "",
      });
    }
    const restored = await r.getWorkspace(wsId);
    expect([restored?.apifyMonthlyCapUsd, restored?.llmMonthlyCapUsd, restored?.nicheBrief]).toEqual([
      before.apifyMonthlyCapUsd,
      before.llmMonthlyCapUsd,
      before.nicheBrief,
    ]);
  });

  it("updateWorkspace: geçersiz yama invalid_input (durum değişmez); tavan kaldırılamaz; tavan 0 yeni Apify işini engeller", async () => {
    const r = create();
    const before = await seedWorkspace(r);
    const bad: unknown[] = [
      { apifyMonthlyCapUsd: -1 },
      { llmMonthlyCapUsd: MAX_CAP_USD + 0.01 },
      { apifyMonthlyCapUsd: Number.NaN },
      { apifyMonthlyCapUsd: "5" },
      // Tavan kaldırılamaz: null (eski "sınırsız") artık geçersiz.
      { apifyMonthlyCapUsd: null },
      { llmMonthlyCapUsd: null },
      { nicheBrief: "n".repeat(NICHE_BRIEF_MAX_LENGTH + 1) },
      { nicheBrief: 42 },
      null,
    ];
    for (const patch of bad) await expectCode(r.updateWorkspace(wsId, patch as WorkspacePatch), "invalid_input");
    expect(await r.getWorkspace(wsId)).toEqual(before);

    // Yeni tavan sonraki bütçe kontrolüne hemen yansır: 0 → hiçbir Apify koşusu başlamaz (harcama kapalı).
    try {
      await r.updateWorkspace(wsId, { apifyMonthlyCapUsd: 0 });
      await expectCode(r.addCompetitor(wsId, { platform: "instagram", handle: `tavan.${Date.now().toString(36)}` }), "budget_exceeded");
    } finally {
      await r.updateWorkspace(wsId, { apifyMonthlyCapUsd: before.apifyMonthlyCapUsd });
    }
    expect((await r.getWorkspace(wsId))?.apifyMonthlyCapUsd).toBe(before.apifyMonthlyCapUsd);
  });
}
