import { describe, expect, it } from "vitest";
import {
  asRecord,
  firstDefined,
  pickBool,
  pickCount,
  pickDate,
  pickId,
  pickNumber,
  pickString,
  pickStringArray,
} from "@/lib/platforms/_shared/field-pick";

describe("field-pick", () => {
  it("firstDefined: sırayla ilk dolu; noktalı yol ve dizi indeksi; 0/false doludur, ''/null boştur", () => {
    const item = { a: null, b: "", c: 0, d: false, e: { f: [{ g: "x" }] } };
    expect(firstDefined(item, ["a", "b", "c"])).toBe(0);
    expect(firstDefined(item, ["a", "d"])).toBe(false);
    expect(firstDefined(item, ["zzz", "e.f.0.g"])).toBe("x");
    expect(firstDefined(item, ["a", "b", "yok"])).toBeUndefined();
    expect(firstDefined(item, ["c.x.y"])).toBeUndefined();
  });

  it("pickString: boşluktan ibaret metin ve metin olmayan değer undefined; metin kırpılmadan döner", () => {
    expect(pickString({ a: "  merhaba \n" }, ["a"])).toBe("  merhaba \n");
    expect(pickString({ a: "   " }, ["a"])).toBeUndefined();
    expect(pickString({ a: 5 }, ["a"])).toBeUndefined();
  });

  it("pickNumber/pickCount: 0 korunur, sayı gibi metin çevrilmez, negatif sayaç ölçülemedi", () => {
    expect(pickNumber({ a: 0 }, ["a"])).toBe(0);
    expect(pickNumber({ a: "12" }, ["a"])).toBeUndefined();
    expect(pickNumber({ a: Number.NaN }, ["a"])).toBeUndefined();
    expect(pickNumber({ a: Infinity }, ["a"])).toBeUndefined();
    expect(pickNumber({ a: -1 }, ["a"])).toBe(-1);
    expect(pickCount({ a: -1 }, ["a"])).toBeUndefined();
    expect(pickCount({ a: 0 }, ["a"])).toBe(0);
  });

  it("pickDate: ISO metni, saniye/milisaniye epoch'u, saat dilimsiz metin UTC; geçersiz undefined", () => {
    expect(pickDate({ t: "2026-09-11T16:07:13.000Z" }, ["t"])).toBe("2026-09-11T16:07:13.000Z");
    expect(pickDate({ t: 1_789_142_833 }, ["t"])).toBe("2026-09-11T16:07:13.000Z");
    expect(pickDate({ t: 1_789_142_833_000 }, ["t"])).toBe("2026-09-11T16:07:13.000Z");
    expect(pickDate({ t: "2026-09-11T16:07:13" }, ["t"])).toBe("2026-09-11T16:07:13.000Z");
    expect(pickDate({ t: "2026-09-11T19:07:13+03:00" }, ["t"])).toBe("2026-09-11T16:07:13.000Z");
    expect(pickDate({ t: "dün" }, ["t"])).toBeUndefined();
    expect(pickDate({ t: 1e20 }, ["t"])).toBeUndefined(); // geçersiz tarih fırlatmaz
    expect(pickDate({}, ["t"])).toBeUndefined();
  });

  it("pickId: metin ya da güvenli tam sayı; kesilmiş büyük sayı ve boş değer undefined; kimlik UYDURULMAZ", () => {
    expect(pickId({ id: "3983939388063538023" }, ["id"])).toBe("3983939388063538023");
    expect(pickId({ id: 12345 }, ["id"])).toBe("12345");
    expect(pickId({ id: Number("3983939388063538023") }, ["id"])).toBeUndefined();
    expect(pickId({ id: " " }, ["id"])).toBeUndefined();
    expect(pickId({}, ["id", "pk"])).toBeUndefined();
  });

  it("pickBool: yalnız gerçek boolean", () => {
    expect(pickBool({ a: false }, ["a"])).toBe(false);
    expect(pickBool({ a: "true" }, ["a"])).toBeUndefined();
    expect(pickBool({ a: null, b: true }, ["a", "b"])).toBe(true);
  });

  it("pickStringArray: metin olmayanları atar; boş dizi undefined", () => {
    expect(pickStringArray({ a: ["x", 1, "", "y"] }, ["a"])).toEqual(["x", "y"]);
    expect(pickStringArray({ a: [] }, ["a"])).toBeUndefined();
    expect(pickStringArray({ a: "x" }, ["a"])).toBeUndefined();
  });

  it("asRecord: yalnız düz nesne", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord([])).toBeUndefined();
    expect(asRecord(null)).toBeUndefined();
    expect(asRecord("x")).toBeUndefined();
  });
});
