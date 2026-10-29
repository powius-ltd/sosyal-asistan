/** Kendi hesap kaynağı: Zernio anahtarı + kendi içerik varsa `zernio` (Apify'a gidilmez); ilk toplama ve anahtarsız hesap `apify`. */
import { describe, expect, it } from "vitest";

import { ownSourceOf } from "@/lib/collection/own-source";
import type { AdminClient } from "@/lib/supabase/admin";

function fakeClient(slug: string | null, ownContent: number): AdminClient {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: slug === null ? null : { slug }, error: null });
    chain.then = (resolve: (v: unknown) => void) => resolve(table === "content_items" ? { count: ownContent, error: null } : { data: [], error: null });
    return chain;
  };
  return { from } as unknown as AdminClient;
}

const ENV = { ZERNIO_API_KEY_ORNEK_HESAP: "x" };

describe("ownSourceOf", () => {
  it("anahtar var + kendi içerik var → zernio", async () => {
    expect(await ownSourceOf(fakeClient("ornek-hesap", 12), "ws", ["acc"], ENV)).toBe("zernio");
  });
  it("anahtar var ama hiç kendi içerik yok (ilk toplama) → apify", async () => {
    expect(await ownSourceOf(fakeClient("ornek-hesap", 0), "ws", ["acc"], ENV)).toBe("apify");
  });
  it("anahtar yok → apify; başka hesabın anahtarı sayılmaz", async () => {
    expect(await ownSourceOf(fakeClient("ornekhesap", 12), "ws", ["acc"], ENV)).toBe("apify");
  });
  it("kendi hesap yok → apify (DB okunmaz)", async () => {
    expect(await ownSourceOf(fakeClient("ornek-hesap", 12), "ws", [], ENV)).toBe("apify");
  });
});
