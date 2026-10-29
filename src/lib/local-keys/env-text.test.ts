import { describe, expect, it } from "vitest";

import { upsertEnvText, validateKeyValue } from "@/lib/local-keys/env-text";

describe("validateKeyValue", () => {
  it("gerçek anahtar biçimlerini kabul eder", () => {
    expect(validateKeyValue("  apify_api_AbC123-xyz  ")).toEqual({ ok: true, value: "apify_api_AbC123-xyz" });
    expect(validateKeyValue("sk_0123456789abcdef")).toMatchObject({ ok: true });
  });
  it.each(["", "kisa", 'abc"defgh123', "abc=defgh123", "abc defgh123", "abc\ndefgh123", "abc#defgh123", "abc$defgh123", "x".repeat(301)])("%j reddedilir", (raw) => {
    expect(validateKeyValue(raw).ok).toBe(false);
  });
  it("hata iletisi değeri içermez", () => {
    const result = validateKeyValue("gizli=deger-123");
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("gizli");
  });
});

describe("upsertEnvText", () => {
  it("var olan satırı değiştirir, diğerlerini ve yorumları aynen korur", () => {
    const text = "# yorum\nA=1\nAPIFY_TOKEN=eski\n\nB=2\n";
    expect(upsertEnvText(text, "APIFY_TOKEN", "yeni123")).toBe("# yorum\nA=1\nAPIFY_TOKEN=yeni123\n\nB=2\n");
  });
  it("yoksa sona ekler (sonda satır sonu olmasa da)", () => {
    expect(upsertEnvText("A=1", "X_KEY", "v12345678")).toBe("A=1\nX_KEY=v12345678\n");
    expect(upsertEnvText("", "X_KEY", "v12345678")).toBe("X_KEY=v12345678\n");
  });
  it("boş değer satırı kaldırır; tekrarlar da gider; yoksa metin değişmez", () => {
    expect(upsertEnvText("A=1\nX_KEY=a\nB=2\nX_KEY=b\n", "X_KEY", undefined)).toBe("A=1\nB=2\n");
    expect(upsertEnvText("A=1\n", "X_KEY", undefined)).toBe("A=1\n");
  });
  it("benzer adlı satıra dokunmaz ve CRLF'i korur", () => {
    expect(upsertEnvText("X_KEY_2=a\r\nX_KEY=b\r\n", "X_KEY", "yeni123")).toBe("X_KEY_2=a\r\nX_KEY=yeni123\r\n");
  });
  it("geçersiz ad fırlatır", () => {
    expect(() => upsertEnvText("", "kötü ad", "v")).toThrow();
  });
});
