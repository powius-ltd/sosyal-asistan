import { describe, expect, it } from "vitest";

import { ticketOpening } from "@/components/studio-order/opening";
import type { StudioOrder } from "@/lib/domain/studio-order";

const order = (ana_hat: string[] | undefined, note: string) => ({ ticket: { ana_hat }, note }) as unknown as Pick<StudioOrder, "ticket" | "note">;

describe("ticketOpening", () => {
  it("konu modu: ana hattın açılış satırını ayırır, kalan hat sırayla durur", () => {
    expect(ticketOpening(order(["Önerilen açılış: Bu hatayı yapma", "Hikâye", "Çağrı"], ""))).toEqual({ opening: "Bu hatayı yapma", outline: ["Hikâye", "Çağrı"], note: "" });
  });
  it("senaryo modu: nottaki açılış satırını çıkarır, diğer not satırları kalır", () => {
    const result = ticketOpening(order(undefined, "Fikir: X\nSeçili açılış: Kimse söylemedi\nDiğer açılış adayları: a · b"));
    expect(result.opening).toBe("Kimse söylemedi");
    expect(result.note).toBe("Fikir: X\nDiğer açılış adayları: a · b");
  });
  it("açılış yoksa undefined", () => {
    expect(ticketOpening(order(["Hikâye"], "Not")).opening).toBeUndefined();
  });
});
