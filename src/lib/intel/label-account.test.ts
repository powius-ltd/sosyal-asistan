import { describe, expect, it, vi } from "vitest";

import type { AccountType } from "@/lib/domain/account-type";
import type { IntelContext } from "@/lib/intel/context";
import { runLabeling } from "@/lib/intel/label-run";
import { labelingSkipReason } from "@/lib/intel/label-select";
import { labelOutput } from "@/lib/orchestrator/step-outputs";

/** Etiketleme atlanırken hiçbir okuma/yazma/model çağrısı olmamalı: istemci ve depo çağrılırsa test düşer. */
function forbiddenCtx(accountType: AccountType): IntelContext {
  const forbidden = new Proxy({}, { get: () => () => { throw new Error("atlanan çalışma alanında okuma/yazma yapılmamalı"); } });
  return { client: forbidden, repo: forbidden, workspaceId: "ws-1", workspace: { accountType }, now: new Date("2026-10-01T09:00:00Z") } as unknown as IntelContext;
}

describe("labelingSkipReason", () => {
  it("creator → neden (Türkçe, tür adıyla); business ve mixed → undefined", () => {
    expect(labelingSkipReason("creator")).toContain("İçerik üreticisi");
    expect(labelingSkipReason("creator")).toContain("açı × farkındalık etiketlemesi uygulanmaz");
    expect(labelingSkipReason("business")).toBeUndefined();
    expect(labelingSkipReason("mixed")).toBeUndefined();
  });
});

describe("runLabeling: açı etiketlemesi uygulanmayan hesap türü", () => {
  it("creator: çalışma alanı atlanır; nedeni günlüğe ve özete yazılır; hiçbir okuma/yazma yok (dry-run dahil)", async () => {
    for (const dryRun of [false, true]) {
      const log = vi.fn();
      const summary = await runLabeling(forbiddenCtx("creator"), { dryRun }, log);
      expect(summary.outcome).toBe("skipped_account_type");
      expect(summary.skipReason).toBe(labelingSkipReason("creator"));
      expect(summary.selected).toBe(0);
      expect(summary.labeled).toBe(0);
      expect(log).toHaveBeenCalledWith(labelingSkipReason("creator"));
    }
  });

  it("rutin çıktısı: atlama hata değil (skipped), neden aynen taşınır", () => {
    const summary = { outcome: "skipped_account_type", skipReason: "Neden metni", counts: {}, selected: 0, labeled: 0, verified: 0, unverified: 0, unsure: 0, unlabelable: 0, failed: 0, batches: 0, seconds: 0 };
    expect(labelOutput(summary as never, false)).toEqual({ status: "skipped", reason: "Neden metni" });
  });
});
