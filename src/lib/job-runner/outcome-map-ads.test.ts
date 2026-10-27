import { describe, expect, it } from "vitest";

import { adsSyncVerdict } from "@/lib/job-runner/outcome-map-ads";
import { jobResultSchema } from "@/lib/data/job-schema";

const counts = { accounts: 1, ads: 2, days: 3, rows: 4, unlinked: 0, skipped: 0, dropped: 0, emptyWrites: 0 };

describe("adsSyncVerdict", () => {
  it("başarı: temiz kapanış", () => {
    const v = adsSyncVerdict({ outcome: "synced", counts });
    expect(v.final).toEqual({ status: "succeeded", result: { exitCode: 0 } });
    expect(v.step.status).toBe("ok");
    expect(v.step.note).toContain("2 reklam");
  });
  it("kısmi: atlanan ve düşen sayılar notta, iş partial + step_failed", () => {
    const v = adsSyncVerdict({ outcome: "partial", counts: { ...counts, skipped: 5, dropped: 2, emptyWrites: 1 }, failures: [{ account: "act_9", error: "unavailable" }] });
    expect(v.final).toEqual({ status: "partial", result: { outcome: "step_failed", exitCode: 4 } });
    expect(v.step).toMatchObject({ status: "failed", code: "step_failed" });
    expect(v.step.note).toContain("5 ölçü satırı");
    expect(v.step.note).toContain("2 öğe");
    expect(v.step.note).toContain("hiç satır yazılamadı");
    expect(v.step.note).toContain("act_9 (unavailable)");
    expect(jobResultSchema.safeParse(v.final.result).success).toBe(true);
  });
  it("anahtar yok: blocked, iş düşmez", () => {
    const v = adsSyncVerdict({ outcome: "key_missing" });
    expect(v.final.status).toBe("blocked");
    expect(v.final.result?.outcome).toBe("zernio_key_missing");
  });
  it("hesap yok: başarı, adım atlandı", () => {
    const v = adsSyncVerdict({ outcome: "no_account" });
    expect(v.step.status).toBe("skipped");
    expect(v.final.status).toBe("succeeded");
  });
  it("auth / plan_required / geçici hata ayrı hüküm", () => {
    expect(adsSyncVerdict({ outcome: "provider_error", error: "auth", counts, failures: [] }).final.status).toBe("blocked");
    expect(adsSyncVerdict({ outcome: "provider_error", error: "plan_required", counts, failures: [] }).step.note).toContain("reklam eklentisi");
    expect(adsSyncVerdict({ outcome: "provider_error", error: "unavailable", counts, failures: [] }).final.status).toBe("partial");
    expect(adsSyncVerdict({ outcome: "provider_error", error: "unavailable", counts: { ...counts, accounts: 0 }, failures: [] }).final.status).toBe("failed");
  });
  it("para birimi uyuşmazlığı: hiçbir tutar yazılmadı notu, iş failed", () => {
    const v = adsSyncVerdict({ outcome: "provider_error", error: "currency_mismatch", counts: { ...counts, accounts: 0 }, failures: [] });
    expect(v.step.note).toContain("para birimi");
    expect(v.final.status).toBe("failed");
  });
  it("tüm sonuçlar iş sonucu şemasından geçer (satıra yazılabilir)", () => {
    for (const run of [
      { outcome: "synced", counts },
      { outcome: "partial", counts, failures: [{ account: "act_1", error: "auth" }] },
      { outcome: "key_missing" },
      { outcome: "no_account" },
      { outcome: "provider_error", error: "auth", counts, failures: [] },
      { outcome: "provider_error", error: "plan_required", counts, failures: [] },
      { outcome: "provider_error", error: "rate_limited", counts, failures: [] },
      { outcome: "provider_error", error: "currency_mismatch", counts, failures: [] },
    ] as const) {
      expect(jobResultSchema.safeParse(adsSyncVerdict(run).final.result).success, run.outcome).toBe(true);
    }
  });
});
