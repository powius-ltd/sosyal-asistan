import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor, filterValue, keysetAfter } from "@/lib/data/supabase/cursor";
import { planPage, type Orderable } from "@/lib/data/supabase/keyset";

describe("imleç: opak kodlama", () => {
  it("değerler gidiş-dönüş aynı kalır (metin, sayı, null); etiket ve uzunluk denetlenir", () => {
    const cursor = encodeCursor("content:recent", ["2026-09-30T12:00:00.123456+00:00", "id-1"]);
    expect(cursor).not.toContain("2026"); // opak: base64url
    expect(decodeCursor(cursor, "content:recent", 2)).toEqual(["2026-09-30T12:00:00.123456+00:00", "id-1"]);
    expect(decodeCursor(encodeCursor("x", [null, "a"]), "x", 2)).toEqual([null, "a"]);
    expect(() => decodeCursor(cursor, "content:lift", 2)).toThrowError(/Geçersiz sayfa imleci/);
    expect(() => decodeCursor(cursor, "content:recent", 1)).toThrowError(/Geçersiz sayfa imleci/);
  });

  it("bozuk imleç invalid_input fırlatır", () => {
    for (const bad of ["", "!!!", "e30", Buffer.from("[1]").toString("base64url"), Buffer.from('["t",{"a":1}]').toString("base64url")]) {
      expect(() => decodeCursor(bad, "t", 1), bad).toThrowError(expect.objectContaining({ name: "RepositoryError", code: "invalid_input" }));
    }
  });
});

describe("filterValue", () => {
  it("çift tırnaklar, ters bölü ve tırnak kaçışlanır", () => {
    expect(filterValue("a,b(c)")).toBe('"a,b(c)"');
    expect(filterValue('x"y\\z')).toBe('"x\\"y\\\\z"');
    expect(filterValue(4.5)).toBe('"4.5"');
  });
});

describe("keysetAfter (desc, nulls last)", () => {
  it("boş olabilen sütun: küçük değer, eşitlikte id, sonra NULL'lar", () => {
    expect(keysetAfter({ column: "published_at", nullable: true, value: "T", id: "i", idDir: "asc" })).toBe(
      'published_at.lt."T",and(published_at.eq."T",id.gt."i"),published_at.is.null',
    );
  });
  it("imleç NULL ise yalnız NULL'lar arasında id ile ilerler", () => {
    expect(keysetAfter({ column: "lift", nullable: true, value: null, id: "i", idDir: "asc" })).toBe('and(lift.is.null,id.gt."i")');
  });
  it("boş olamayan sütun ve azalan id: NULL dalı yok, id.lt", () => {
    expect(keysetAfter({ column: "created_at", nullable: false, value: "T", id: "i", idDir: "desc" })).toBe('created_at.lt."T",and(created_at.eq."T",id.lt."i")');
  });
});

/** Çağrıları kaydeden sahte sorgu (gerçek builder gerekmez). */
function fakeQuery(): Orderable & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const query = {
    calls,
    eq: () => query,
    gte: () => query,
    lte: () => query,
    in: () => query,
    is: () => query,
    not: () => query,
    or: (filters: string) => (calls.push(["or", filters]), query),
    order: (column: string, options: unknown) => (calls.push(["order", column, options]), query),
    limit: (n: number) => (calls.push(["limit", n]), query),
    range: (from: number, to: number) => (calls.push(["range", from, to]), query),
  };
  return query as unknown as Orderable & { calls: unknown[][] };
}

describe("planPage", () => {
  const row = (id: string, lift: number | null, published_at: string | null) => ({ id, lift, published_at });

  it("keyset: ilk sayfa süzgeçsiz sıralanır ve limit+1 ister; sonraki imleç SON GÖRÜNEN satırdan üretilir", () => {
    const plan = planPage<ReturnType<typeof row>>({ tag: "t", column: "published_at", nullable: true, cursor: "keyset" }, undefined, 2);
    const q = fakeQuery();
    plan.apply(q);
    expect(q.calls).toEqual([["order", "published_at", { ascending: false, nullsFirst: false }], ["order", "id", { ascending: true }], ["limit", 3]]);
    const rows = [row("a", 1, "T3"), row("b", 1, "T2"), row("c", 1, "T1")];
    expect(decodeCursor(plan.nextCursor(rows) as string, "t", 2)).toEqual(["T2", "b"]);
    expect(plan.nextCursor(rows.slice(0, 2))).toBeUndefined();
  });

  it("keyset: imleç verilirse `or` süzgeci eklenir; bozuk imleç invalid_input", () => {
    const cursor = encodeCursor("t", ["T2", "b"]);
    const q = fakeQuery();
    planPage({ tag: "t", column: "published_at", nullable: true, cursor: "keyset" }, cursor, 2).apply(q);
    expect(q.calls[0][0]).toBe("or");
    expect(() => planPage({ tag: "t", column: "published_at", nullable: true, cursor: "keyset" }, encodeCursor("x", ["T2", "b"]), 2).apply(fakeQuery())).toThrowError(/Geçersiz sayfa imleci/);
    expect(() => planPage({ tag: "t", column: "published_at", nullable: true, cursor: "keyset" }, encodeCursor("t", ["T2", 5]), 2).apply(fakeQuery())).toThrowError(/Geçersiz sayfa imleci/);
  });

  it("offset (float sütunlar): sıra konumu imleçtir; range(offset, offset+limit)", () => {
    const sort = { tag: "lift", column: "lift", nullable: true, cursor: "offset" as const };
    const first = fakeQuery();
    const plan = planPage<ReturnType<typeof row>>(sort, undefined, 2);
    plan.apply(first);
    expect(first.calls.at(-1)).toEqual(["range", 0, 2]);
    const next = plan.nextCursor([row("a", 1, null), row("b", 2, null), row("c", 3, null)]) as string;
    expect(decodeCursor(next, "lift", 1)).toEqual([2]);
    const second = fakeQuery();
    planPage(sort, next, 2).apply(second);
    expect(second.calls.at(-1)).toEqual(["range", 2, 4]);
    expect(() => planPage(sort, encodeCursor("lift", [-1]), 2)).toThrowError(/Geçersiz sayfa imleci/);
    expect(() => planPage(sort, encodeCursor("lift", ["1"]), 2)).toThrowError(/Geçersiz sayfa imleci/);
  });
});
