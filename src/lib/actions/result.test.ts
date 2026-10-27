import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ACTION_OK, actionFail, actionOk, toActionError, validationFail } from "@/lib/actions/result";
import { ComplianceFailedError, RepositoryError, type RepositoryErrorCode } from "@/lib/data/repository";

const CODES: RepositoryErrorCode[] = [
  "not_found",
  "invalid_state",
  "invalid_input",
  "already_exists",
  "budget_exceeded",
  "not_implemented",
];

afterEach(() => vi.restoreAllMocks());

describe("toActionError", () => {
  it("her depo hata kodunu kodu koruyarak Türkçe mesaja çevirir", () => {
    for (const code of CODES) {
      const result = toActionError(new RepositoryError(code, "ham ayrıntı"));
      expect(result.ok, code).toBe(false);
      expect(result.code).toBe(code);
      expect(result.message.length).toBeGreaterThan(10);
      expect(result.message).not.toContain("ham ayrıntı");
    }
  });

  it("bağlama özel metin yalnız verilen kodu değiştirir", () => {
    const overrides = { already_exists: "@kahve zaten ekli." };
    expect(toActionError(new RepositoryError("already_exists", "x"), overrides).message).toBe("@kahve zaten ekli.");
    expect(toActionError(new RepositoryError("not_found", "x"), overrides).message).toContain("Kayıt bulunamadı");
  });

  it("uyum engeli: özel Türkçe mesaj olduğu gibi iletilir (bağlam metniyle ezilmez), kod invalid_state", () => {
    const error = new ComplianceFailedError("Uyum denetimi başarısız: ibare yok.", { status: "fail", findings: [] });
    expect(error).toBeInstanceOf(RepositoryError);
    expect(toActionError(error, { invalid_state: "Yalnız taslak onaya gönderilebilir." })).toEqual({
      ok: false,
      code: "invalid_state",
      message: "Uyum denetimi başarısız: ibare yok.",
    });
  });

  it("beklenmeyen hatada ayrıntı sızdırmaz, sunucu günlüğüne yazar", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = toActionError(new Error("db parolası: hunter2"));
    expect(result).toMatchObject({ ok: false, code: "unknown" });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe("sonuç kurucuları", () => {
  it("ACTION_OK, actionOk ve actionFail", () => {
    expect(ACTION_OK).toEqual({ ok: true });
    expect(actionOk({ message: "Tamam." })).toEqual({ ok: true, message: "Tamam." });
    expect(actionFail("Hata.")).toEqual({ ok: false, code: "invalid_input", message: "Hata." });
    expect(actionFail("Yok.", "not_found").code).toBe("not_found");
  });

  it("validationFail: ilk sorunun mesajı, yoksa yedek", () => {
    const parsed = z.object({ n: z.number({ error: "Sayı olmalı." }) }).safeParse({ n: "x" });
    if (parsed.success) throw new Error("beklenen hata yok");
    expect(validationFail(parsed.error)).toEqual({ ok: false, code: "invalid_input", message: "Sayı olmalı." });
    expect(validationFail(new z.ZodError([]), "Yedek").message).toBe("Yedek");
  });
});
