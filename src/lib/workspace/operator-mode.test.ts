import { describe, expect, it } from "vitest";

import { isOperatorMode } from "@/lib/workspace/operator-mode";

describe("isOperatorMode", () => {
  it("yerelde (VERCEL yok, OPERATOR_MODE yok) açık; üretim derlemesi (NODE_ENV=production) yerel `next start`'ı kapatmaz", () => {
    expect(isOperatorMode({})).toBe(true);
    expect(isOperatorMode({ NODE_ENV: "production" })).toBe(true);
    expect(isOperatorMode({ OPERATOR_MODE: "" })).toBe(true);
    expect(isOperatorMode({ OPERATOR_MODE: "  " })).toBe(true);
  });

  it("OPERATOR_MODE=local açık (büyük/küçük harf duyarsız); başka her değer kapalı", () => {
    expect(isOperatorMode({ OPERATOR_MODE: "local" })).toBe(true);
    expect(isOperatorMode({ OPERATOR_MODE: " LOCAL " })).toBe(true);
    expect(isOperatorMode({ OPERATOR_MODE: "off" })).toBe(false);
    expect(isOperatorMode({ OPERATOR_MODE: "remote" })).toBe(false);
    expect(isOperatorMode({ OPERATOR_MODE: "true" })).toBe(false);
  });

  it("Vercel'de HER ZAMAN kapalı: OPERATOR_MODE=local bile açmaz", () => {
    expect(isOperatorMode({ VERCEL: "1" })).toBe(false);
    expect(isOperatorMode({ VERCEL: "1", OPERATOR_MODE: "local" })).toBe(false);
    expect(isOperatorMode({ VERCEL: "1", NODE_ENV: "production", OPERATOR_MODE: "local" })).toBe(false);
  });
});
