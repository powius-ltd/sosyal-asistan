import { describe, expect, it } from "vitest";

import { planRoutine } from "@/lib/orchestrator/plan-routine";
import { renderRoutineMarkdown, routineNotification, summaryLines } from "@/lib/orchestrator/report";
import { analyzeOutput, collectOutput, labelOutput, planOutput } from "@/lib/orchestrator/step-outputs";
import { baseState, NOW } from "@/lib/orchestrator/test-support";
import type { RoutineReport } from "@/lib/orchestrator/types";

const state = baseState();
const report: RoutineReport = {
  startedAt: NOW,
  dryRun: false,
  state,
  plan: planRoutine(state),
  exitCode: 4,
  steps: [
    { step: "precheck", status: "ok", reason: "tamam", seconds: 0.4 },
    { step: "collect", status: "needs_approval", reason: "Apify parası harcar; onay yok", seconds: 0, spend: { estimateUsd: 0.27 } },
    { step: "analyze", status: "failed", reason: "agy kullanılamıyor", seconds: 2.5 },
    { step: "plan", status: "skipped", reason: "plan zaten var", seconds: 0 },
  ],
};

describe("rapor", () => {
  it("markdown: adım başına durum + sebep + süre; para harcayan adımda tahmin, gerçek bilinmiyorsa tire", () => {
    const md = renderRoutineMarkdown(report);
    expect(md).toContain("| 1 · Topla (Apify) | needs_approval | 0 sn |");
    expect(md).toContain("tahmin $0,27, gerçek —");
    expect(md).toContain("| 2 · Video analizi (agy) | failed | 2.5 sn |");
    expect(md).toContain("## Onay bekleyenler");
    expect(md).toContain("npm run collect:now");
  });

  it("kuru koşu özeti kararları yazar; adım sonucu bölümü yok", () => {
    const lines = summaryLines({ startedAt: NOW, dryRun: true, state, plan: planRoutine(state), steps: [], exitCode: 0 });
    expect(lines.join("\n")).toContain("DRY-RUN");
    expect(lines.join("\n")).not.toContain("Adım sonuçları");
  });

  it("terminal özeti onayın bayrağını durum satırında söyler (adım nedeni bayrak taşımaz)", () => {
    const lines = summaryLines({ startedAt: NOW, dryRun: true, state, plan: planRoutine(state), steps: [], exitCode: 0 });
    expect(lines.find((line) => line.includes("Apify:"))).toContain("--apify-max verilmedi");
    expect(lines.find((line) => line.includes("Topla (Apify): onay bekliyor"))).not.toContain("--apify-max");
  });

  it("bildirim: hafta anahtarıyla tekilleşir; başarısız ve onay bekleyen adımlar gövdede", () => {
    const draft = routineNotification(report, "2026-09-28");
    expect(draft.dedupeKey).toBe("routine:2026-09-28");
    expect(draft.title).toContain("kısmen");
    expect(draft.body).toContain("Başarısız: 2 · Video analizi (agy)");
    expect(draft.body).toContain("Onay bekliyor: 1 · Topla (Apify)");
    expect(routineNotification({ ...report, exitCode: 0, steps: [] }, "w").title).toBe("Haftalık rutin tamamlandı");
  });
});

describe("adım çıktısı eşlemesi", () => {
  it("toplama: tavan aşıldı → needs_approval (hata değil); tutar bilinmiyorsa gerçek undefined", () => {
    const blocked = collectOutput({ outcome: "blocked", plan: { estimatedUsd: 0.4, maxUsd: 0.3 }, targets: [], runs: [], cost: { reservedUsd: 0, pendingReconcile: 0 }, notes: [] } as never);
    expect(blocked.status).toBe("needs_approval");
    expect(blocked.reason, "neden panelde de okunur: terminal bayrağı yazmaz").not.toMatch(/--[a-z]|npm run/);
    const done = collectOutput({ outcome: "completed", plan: { estimatedUsd: 0.2, maxUsd: 0.3 }, targets: [], runs: [], cost: { reservedUsd: 0.2, pendingReconcile: 1 }, notes: [] } as never);
    expect(done.status).toBe("ok");
    expect(done.spend).toEqual({ estimateUsd: 0.2, actualUsd: undefined });
  });

  it("analiz: needs_recollect → needs_approval; backend_unavailable → failed; hepsi başarısız → failed", () => {
    const base = { selected: 5, ok: 0, insufficient: 0, failed: 0, skippedByCap: 0, expired: 0, missing: 0, agyCalls: 0, screening: {}, seconds: 1 };
    const recollect = analyzeOutput({ ...base, outcome: "needs_recollect", expired: 5 } as never);
    expect(recollect.status).toBe("needs_approval");
    expect([recollect.reason, ...(recollect.notes ?? [])].join(" "), "not panelde de okunur: terminal bayrağı / komutu yazmaz").not.toMatch(/--[a-z]|npm run/);
    expect(analyzeOutput({ ...base, outcome: "backend_unavailable" } as never).status).toBe("failed");
    expect(analyzeOutput({ ...base, outcome: "completed", failed: 5 } as never).status).toBe("failed");
    expect(analyzeOutput({ ...base, outcome: "completed", ok: 4, failed: 1 } as never).status).toBe("ok");
    expect(analyzeOutput({ ...base, outcome: "nothing_to_do" } as never).status).toBe("skipped");
  });

  it("etiket: parti hatası failed; kalıcı hata llmUnavailable işaretler", () => {
    const base = { outcome: "completed", counts: {}, selected: 3, labeled: 0, verified: 0, unverified: 0, unsure: 0, unlabelable: 0, failed: 3, batches: 0, seconds: 1 };
    expect(labelOutput(base as never, true)).toMatchObject({ status: "failed", llmUnavailable: true });
    expect(labelOutput(base as never, false).llmUnavailable).toBeUndefined();
  });

  it("plan: voice_unusable ve kept_existing hata değil (skipped) ve brifinge not bırakır", () => {
    const base = { weekStart: "2026-10-05", confidence: "low", ideas: 0, planned: 0, notes: [], markdown: "", seconds: 1 };
    for (const outcome of ["voice_unusable", "kept_existing"] as const) {
      const out = planOutput({ ...base, outcome } as never);
      expect(out.status).toBe("skipped");
      expect(out.planNote).toContain("2026-10-05");
    }
    expect(planOutput({ ...base, outcome: "saved", status: "ready", ideas: 6, planned: 4 } as never).status).toBe("ok");
  });
});
