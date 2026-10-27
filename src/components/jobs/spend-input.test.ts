import { describe, expect, it } from "vitest";

import { jobDurationLabel, JOB_PREVIEW_LABEL } from "@/components/jobs/job-format";
import { parseSpendInput, spendInputDefault } from "@/components/jobs/spend-input";
import { JOB_SPEND_MAX_USD, suggestApprovalUsd } from "@/lib/domain/panel-job";

describe("parseSpendInput (onay tutarı)", () => {
  it("geçerli tutar: virgül ve nokta ondalık ayırıcı, sınır değeri dahil", () => {
    expect(parseSpendInput("0,15")).toEqual({ ok: true, value: 0.15 });
    expect(parseSpendInput(" 0.2 ")).toEqual({ ok: true, value: 0.2 });
    expect(parseSpendInput(String(JOB_SPEND_MAX_USD))).toEqual({ ok: true, value: JOB_SPEND_MAX_USD });
  });

  it("boş, sayı olmayan, 0, negatif ve sınır üstü tutar geçersizdir (gönderilmez)", () => {
    for (const raw of ["", "   ", "abc", "0", "0,00", "-1", "2,01", "1e9", "Infinity"]) {
      const parsed = parseSpendInput(raw);
      expect(parsed.ok, `"${raw}"`).toBe(false);
      if (!parsed.ok) expect(parsed.message).not.toBe("");
    }
  });

  it("ön değer: önerilen tutar tr-TR biçiminde; öneri yoksa boş (0 uydurulmaz)", () => {
    expect(spendInputDefault(suggestApprovalUsd(0.13))).toBe("0,15");
    expect(spendInputDefault(suggestApprovalUsd(undefined))).toBe("");
    expect(spendInputDefault(suggestApprovalUsd(5))).toBe("");
    // Ön değer alana yazıldığı hâliyle geçerli bir tutardır.
    expect(parseSpendInput(spendInputDefault(0.15))).toEqual({ ok: true, value: 0.15 });
  });
});

describe("iş gösterim yardımcıları", () => {
  it("iş süresi başlangıç ve bitişten hesaplanır; hiç alınmayan işte yoktur", () => {
    expect(jobDurationLabel({ startedAt: "2026-10-05T12:00:00.000Z", finishedAt: "2026-10-05T12:14:12.000Z" })).toBe("14 dk 12 sn");
    expect(jobDurationLabel({ finishedAt: "2026-10-05T12:14:12.000Z" })).toBeUndefined();
    expect(jobDurationLabel({ startedAt: "2026-10-05T12:00:00.000Z" })).toBeUndefined();
    expect(jobDurationLabel({ startedAt: "bozuk", finishedAt: "2026-10-05T12:14:12.000Z" })).toBeUndefined();
  });

  it("önizleme düğmesinin adı sözlükten gelir", () => {
    expect(JOB_PREVIEW_LABEL).toBe("Önce bak");
  });
});
