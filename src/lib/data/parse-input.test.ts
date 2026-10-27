import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseOrThrow } from "@/lib/data/parse-input";
import { RepositoryError } from "@/lib/data/repository";

const schema = z.object({ name: z.string({ error: "Ad metin olmalı." }).trim().min(1, "Ad boş olamaz.") });

describe("parseOrThrow", () => {
  it("geçerli girdide temizlenmiş veriyi döndürür (kırpma/dönüştürme şemadan)", () => {
    expect(parseOrThrow(schema, { name: "  Kahve " }, "Geçersiz.")).toEqual({ name: "Kahve" });
  });

  it("geçersiz girdide invalid_input fırlatır; mesaj şemanın ilk Türkçe mesajıdır", () => {
    for (const [input, message] of [
      [{ name: "   " }, "Ad boş olamaz."],
      [{ name: 42 }, "Ad metin olmalı."],
    ] as const) {
      expect(() => parseOrThrow(schema, input, "Geçersiz.")).toThrowError(expect.objectContaining({ name: "RepositoryError", code: "invalid_input", message }));
    }
    expect(() => parseOrThrow(schema, null, "Geçersiz.")).toThrow(RepositoryError);
  });

  it("şema mesaj vermezse fallback kullanılır", () => {
    const bare = z.string().refine(() => false);
    expect(() => parseOrThrow(bare, "x", "Geçersiz değer.")).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
});
