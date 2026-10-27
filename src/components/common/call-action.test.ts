import { describe, expect, it } from "vitest";

import { ACTION_UNREACHABLE_MESSAGE, callAction } from "@/components/common/call-action";

describe("callAction", () => {
  it("action'ın sonucunu olduğu gibi döndürür (başarı ve beklenen ret)", async () => {
    expect(await callAction(async () => ({ ok: true as const, message: "Tamam." }))).toEqual({ ok: true, message: "Tamam." });
    const failure = { ok: false as const, code: "not_found" as const, message: "Bulunamadı." };
    expect(await callAction(async () => failure)).toEqual(failure);
  });

  it("action fırlatırsa (ağ/sunucu koptu) yakalar ve Türkçe hata sonucuna çevirir", async () => {
    const result = await callAction(async () => {
      throw new Error("fetch failed");
    });
    expect(result).toEqual({ ok: false, code: "unknown", message: ACTION_UNREACHABLE_MESSAGE });
    expect(ACTION_UNREACHABLE_MESSAGE).toMatch(/^İşlem tamamlanamadı/);
  });

  it("bağlama özel mesaj verilebilir (prompt hazırlama gibi)", async () => {
    const result = await callAction(
      async () => {
        throw new Error("x");
      },
      "Prompt hazırlanamadı. Bağlantını kontrol edip tekrar dene.",
    );
    expect(result).toMatchObject({ ok: false, message: "Prompt hazırlanamadı. Bağlantını kontrol edip tekrar dene." });
  });
});
