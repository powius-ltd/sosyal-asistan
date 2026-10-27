import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AD_ACCOUNT_STATUSES, AD_ENTITY_STATUSES, AD_FORMATS, AD_GOAL_KINDS, AD_PROVIDERS } from "@/lib/domain/ads";

describe("0029_ads.sql domain listeleriyle birebir", () => {
  const sql = readFileSync("supabase/migrations/0029_ads.sql", "utf8");
  const listOf = (column: string): string[] => {
    const match = new RegExp(`${column}\\s+(?:text\\s+)?(?:not null\\s+)?(?:default\\s+'[^']*'\\s+)?check\\s*\\(\\s*${column}\\s+in\\s*\\(([^)]*)\\)`, "i").exec(sql);
    expect(match, `${column} CHECK listesi bulunamadı`).not.toBeNull();
    return [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  };

  it("sağlayıcı, durum, biçim, hedef türü", () => {
    expect(listOf("provider")).toEqual([...AD_PROVIDERS]);
    expect(listOf("goal_kind")).toEqual([...AD_GOAL_KINDS]);
    expect(listOf("format")).toEqual([...AD_FORMATS]);
    expect(sql).toContain(AD_ACCOUNT_STATUSES.map((s) => `'${s}'`).join(", "));
    expect(sql).toContain(AD_ENTITY_STATUSES.map((s) => `'${s}'`).join(", "));
  });
});
