import { describe, expect, it } from "vitest";

import { pickZernioKey, zernioKeyEnvName } from "@/lib/zernio/api-key";

describe("zernioKeyEnvName", () => {
  it("slug'ı büyük harfe ve alt çizgiye çevirir", () => {
    expect(zernioKeyEnvName("ornekstudyoapp")).toBe("ZERNIO_API_KEY_ORNEKSTUDYOAPP");
    expect(zernioKeyEnvName("ornek-hesap")).toBe("ZERNIO_API_KEY_ORNEK_HESAP");
  });
  it("slug yoksa ya da boşsa undefined", () => {
    expect(zernioKeyEnvName(undefined)).toBeUndefined();
    expect(zernioKeyEnvName("  ")).toBeUndefined();
  });
});

describe("pickZernioKey", () => {
  it("çalışma alanına özel anahtarı genel anahtara tercih eder", () => {
    const env = { ZERNIO_API_KEY: "genel", ZERNIO_API_KEY_ORNEKSTUDYOAPP: "ozel" };
    expect(pickZernioKey("ornekstudyoapp", env)).toEqual({ envName: "ZERNIO_API_KEY_ORNEKSTUDYOAPP", apiKey: "ozel" });
  });
  it("ornekstudyoapp için özel yoksa ya da boşsa genel anahtara düşer", () => {
    expect(pickZernioKey("ornekstudyoapp", { ZERNIO_API_KEY: "genel" })?.envName).toBe("ZERNIO_API_KEY");
    expect(pickZernioKey("ornekstudyoapp", { ZERNIO_API_KEY_ORNEKSTUDYOAPP: "  ", ZERNIO_API_KEY: "genel" })?.apiKey).toBe("genel");
  });
  it("başka çalışma alanı (ornek) yalnız genel anahtarla anahtarsız sayılır", () => {
    expect(pickZernioKey("ornek", { ZERNIO_API_KEY: "genel" })).toBeUndefined();
    expect(pickZernioKey("ornek-hesap", { ZERNIO_API_KEY: "genel" })).toBeUndefined();
    expect(pickZernioKey("ornek", { ZERNIO_API_KEY: "genel", ZERNIO_API_KEY_ORNEK: "ozel" })?.envName).toBe("ZERNIO_API_KEY_ORNEK");
    expect(pickZernioKey(undefined, { ZERNIO_API_KEY: "genel" })).toBeUndefined();
  });
  it("hiçbiri yoksa undefined", () => {
    expect(pickZernioKey("ornekstudyoapp", {})).toBeUndefined();
  });
});
