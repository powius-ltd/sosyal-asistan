import { describe, expect, it } from "vitest";

import { manualGrantKey, parseCreditsArgs } from "@/lib/credits/cli-args";
import { CREDIT_KEY_PATTERN } from "@/lib/domain/credits";

const NOW = new Date("2026-10-12T10:00:00.000Z");
const USER = "22222222-2222-4222-8222-222222222222";
const parse = (...argv: string[]) => parseCreditsArgs(argv, NOW);

describe("npm run credits argümanları", () => {
  it("balance: kullanıcı verilmezse yerel kullanıcı (alan yok); --user UUID olmalı", () => {
    expect(parse("balance")).toEqual({ command: "balance" });
    expect(parse("balance", `--user=${USER}`)).toEqual({ command: "balance", userId: USER });
    expect(() => parse("balance", "--user=ali")).toThrow(/UUID/);
    expect(() => parse("balance", "--workspace=x")).toThrow(/Bilinmeyen argüman/);
  });

  it("grant: tutar, kova ve gerekçe zorunlu; purchased süresiz olabilir, monthly dönem sonu ister", () => {
    expect(parse("grant", "--amount=1000", "--bucket=purchased", "--reason=Başlangıç bakiyesi")).toEqual({ command: "grant", amount: 1000, bucket: "purchased", reason: "Başlangıç bakiyesi" });
    expect(parse("grant", "--amount=500", "--bucket=monthly", "--reason=Ekim", "--expires=2026-10-31", `--user=${USER}`)).toEqual({
      command: "grant",
      amount: 500,
      bucket: "monthly",
      reason: "Ekim",
      expiresAt: "2026-10-31T23:59:59.999Z",
      userId: USER,
    });
    expect(() => parse("grant", "--amount=500", "--bucket=monthly", "--reason=Ekim")).toThrow(/--expires ister/);
    expect(() => parse("grant", "--bucket=purchased", "--reason=x")).toThrow(/--amount/);
    expect(() => parse("grant", "--amount=10", "--reason=x")).toThrow(/--bucket/);
    expect(() => parse("grant", "--amount=10", "--bucket=purchased")).toThrow(/--reason zorunlu/);
  });

  it("grant: geçersiz tutar / kova / tarih / anahtar / tekrar reddedilir", () => {
    for (const amount of ["0", "-5", "1.5", "bin", "1000001"]) expect(() => parse("grant", `--amount=${amount}`, "--bucket=purchased", "--reason=x"), amount).toThrow(/--amount/);
    expect(() => parse("grant", "--amount=10", "--bucket=bonus", "--reason=x")).toThrow(/--bucket/);
    expect(() => parse("grant", "--amount=10", "--bucket=purchased", "--reason=x", "--expires=dün")).toThrow(/geçerli bir tarih/);
    expect(() => parse("grant", "--amount=10", "--bucket=purchased", "--reason=x", "--expires=2026-10-11")).toThrow(/geçmişte olamaz/);
    expect(() => parse("grant", "--amount=10", "--bucket=purchased", "--reason=x", "--key=boşluklu anahtar")).toThrow(/--key/);
    expect(() => parse("grant", "--amount=10", "--amount=20", "--bucket=purchased", "--reason=x")).toThrow(/bir kez/);
    expect(() => parse("grant", "--amount=10", "--bucket=purchased", "--reason=")).toThrow(/boş olamaz/);
    expect(() => parse("ver")).toThrow(/Kullanım/);
    expect(() => parse()).toThrow(/Kullanım/);
  });

  it("anahtar: kullanıcıyı içerir, defterin biçimine uyar; aynı gün aynı girdi aynı anahtar, fark eden girdi / kullanıcı / gün başka anahtar", () => {
    const grant = { amount: 1000, bucket: "purchased", reason: "Başlangıç bakiyesi" } as const;
    const key = manualGrantKey(USER, grant, NOW);
    expect(key).toContain(USER);
    expect(key.startsWith(`manual:${USER}:2026-10-12:`)).toBe(true);
    expect(CREDIT_KEY_PATTERN.test(key)).toBe(true);
    expect(manualGrantKey(USER, { ...grant }, new Date("2026-10-12T23:00:00.000Z")), "aynı gün ikinci kez vermez").toBe(key);
    const others = [
      manualGrantKey(USER, { ...grant, amount: 1001 }, NOW),
      manualGrantKey(USER, { ...grant, bucket: "monthly", expiresAt: "2026-10-31T23:59:59.999Z" }, NOW),
      manualGrantKey(USER, { ...grant, reason: "Düzeltme" }, NOW),
      manualGrantKey("33333333-3333-4333-8333-333333333333", grant, NOW),
      manualGrantKey(USER, grant, new Date("2026-10-13T00:00:00.000Z")),
    ];
    expect(new Set([key, ...others]).size).toBe(others.length + 1);
  });
});
