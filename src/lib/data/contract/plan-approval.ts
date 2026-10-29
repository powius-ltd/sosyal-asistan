/**
 * Sözleşme parçası: plan onayı (`approveWeeklyPlan`, SPN-35). Onay planın fikirlerini seçer (`new` → `saved`), onay anını yazar ve değişmez.
 * Onayın geri alınışı yoktur: test, kendi seçtiği fikirleri eski durumuna döndürür (`saved → dismissed → new`); plan satırındaki onay anı kalır
 * (sözleşme süiti kendi test çalışma alanında koşar, gerçek plana dokunmaz).
 */
import { expect, it } from "vitest";

import type { IdeaStatus } from "@/lib/domain/intel";
import { expectCode, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";

export function planApprovalContract(ctx: ContractContext): void {
  const { wsId, foreign, create } = ctx;

  it("approveWeeklyPlan: plana giren yeni fikirler seçilir, adaylara dokunulmaz; onay anı yazılır ve ikinci onayda değişmez", async () => {
    const r = create();
    const summaries = await r.listWeeklyPlans(wsId);
    const target = summaries.find((s) => s.status === "ready" && s.plannedCount > 0);
    expect(target, "seed: onaylanabilir (ready) plan").toBeDefined();
    if (!target) return;

    const before = await r.getWeeklyPlan(wsId, target.weekStart);
    if (!before) throw new Error("plan okunamadı");
    const statusBefore = new Map<string, IdeaStatus>([...before.items, ...before.alternatives].map((i) => [i.ideaId, i.idea.status]));

    const first = new Date("2030-01-07T09:00:00.000Z");
    const approved = await r.approveWeeklyPlan(wsId, target.weekStart, first);
    try {
      expect(approved.id).toBe(before.id);
      expect(approved.approvedAt, "onay anı yazıldı").toBeDefined();
      if (before.approvedAt === undefined) expect(Date.parse(approved.approvedAt as string)).toBe(first.getTime());
      for (const item of approved.items) {
        const was = statusBefore.get(item.ideaId);
        expect(item.idea.status, `${item.ideaId}: plana giren ${was} fikir`).toBe(was === "new" ? "saved" : was);
      }
      for (const item of approved.alternatives) expect(item.idea.status, `${item.ideaId}: aday dokunulmaz`).toBe(statusBefore.get(item.ideaId));

      const again = await r.approveWeeklyPlan(wsId, target.weekStart, new Date("2030-01-08T09:00:00.000Z"));
      expect(again.approvedAt, "ikinci onay anı değiştirmez").toBe(approved.approvedAt);
      expect((await r.getWeeklyPlan(wsId, target.weekStart))?.approvedAt).toBe(approved.approvedAt);
    } finally {
      for (const item of before.items) {
        if (statusBefore.get(item.ideaId) !== "new") continue;
        await r.updateIdeaStatus(wsId, item.ideaId, "dismissed");
        await r.updateIdeaStatus(wsId, item.ideaId, "new");
      }
    }
  });

  it("approveWeeklyPlan: plansız hafta not_found; geçersiz gün invalid_input; bilinmeyen workspace hata verir", async () => {
    const r = create();
    await expectCode(r.approveWeeklyPlan(wsId, "2000-01-03", new Date("2030-01-07T09:00:00.000Z")), "not_found");
    await expectCode(r.approveWeeklyPlan(wsId, "bugün", new Date("2030-01-07T09:00:00.000Z")), "invalid_input");
    await expectCode(r.approveWeeklyPlan(MISSING_ID, "2000-01-03", new Date("2030-01-07T09:00:00.000Z")), "not_found");
    await expectCode(r.approveWeeklyPlan(foreign, "2000-01-03", new Date("2030-01-07T09:00:00.000Z")), "not_found");
  });
}
