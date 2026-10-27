import { describe, expect, it } from "vitest";

import {
  CANCEL_JOB_MESSAGES,
  JOBS_GATE_MESSAGE,
  REQUEST_JOB_INVALID,
  REQUEST_JOB_MESSAGES,
  routineForAllSummary,
  WORKER_NOT_READY,
  WORKER_START_FAILED,
} from "@/lib/job-control/messages";
import { PANEL_JARGON } from "@/lib/plain-language";

/** Kullanıcıya dönen metinde sağlayıcı adı, komut ve teknik terim olmaz. */
const TECHNICAL = /apify|claude|supabase|npm|worker|spawn|queue|kuyruk|işçi|betik|\.mts|DATA_SOURCE|OPERATOR_MODE/i;

const summary = routineForAllSummary({ requested: 1200, skipped: 2, failed: 1 }, "Hesap bulunamadı.");
const ALL = [
  ...Object.values(JOBS_GATE_MESSAGE),
  ...Object.values(REQUEST_JOB_MESSAGES),
  ...Object.values(CANCEL_JOB_MESSAGES),
  REQUEST_JOB_INVALID,
  WORKER_START_FAILED,
  WORKER_NOT_READY,
  summary,
  routineForAllSummary({ requested: 0, skipped: 0, failed: 3 }, "x"),
  routineForAllSummary({ requested: 3, skipped: 0, failed: 0 }),
  routineForAllSummary({ requested: 0, skipped: 2, failed: 0 }),
];

describe("iş action'larının metinleri", () => {
  it("düz dil: panel jargonu, sağlayıcı adı, komut yok", () => {
    for (const message of ALL) {
      expect(message, message).not.toMatch(PANEL_JARGON);
      expect(message, message).not.toMatch(TECHNICAL);
    }
  });

  it("tüm hesaplar özeti açılan, atlanan ve açılamayan sayıları ayrı ayrı söyler (tr-TR sayı biçimi)", () => {
    expect(summary).toBe("1.200 hesapta haftalık tur sıraya yazıldı. 2 hesapta zaten sırada ya da çalışan bir iş vardı. 1 hesapta başlatılamadı: Hesap bulunamadı.");
    expect(routineForAllSummary({ requested: 0, skipped: 0, failed: 3 }, "x")).toBe("Hiçbir hesapta haftalık tur başlatılamadı. 3 hesapta başlatılamadı: x");
    expect(routineForAllSummary({ requested: 3, skipped: 0, failed: 0 })).toBe("3 hesapta haftalık tur sıraya yazıldı.");
    expect(routineForAllSummary({ requested: 1, skipped: 1, failed: 0 })).toBe("1 hesapta haftalık tur sıraya yazıldı. 1 hesapta zaten sırada ya da çalışan bir iş vardı.");
    expect(routineForAllSummary({ requested: 0, skipped: 2, failed: 0 }), "hepsi atlandı: başarısızlık denmez").toBe("Yeni tur başlatılmadı. 2 hesapta zaten sırada ya da çalışan bir iş vardı.");
    expect(routineForAllSummary({ requested: 1, skipped: 0, failed: 1 }), "neden bilinmiyorsa uydurulmaz").toBe("1 hesapta haftalık tur sıraya yazıldı. 1 hesapta başlatılamadı.");
  });
});
