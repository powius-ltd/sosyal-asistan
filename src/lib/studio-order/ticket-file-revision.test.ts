/**
 * Revize alanlarının fiş dosyasındaki yazımı (SPN-36): not iki nokta / kare / tırnak içerse de YAML'da güvenli kalır, geri okununca aynıdır.
 * Aynı biçimi stüdyo okuyucusu da okur (KRS `fixtures/siparis/revize-fisi.md`, `read-ticket.test.ts`).
 */
import { describe, expect, it } from "vitest";

import { readTicket, writeTicket } from "@/lib/studio-order/ticket-file";
import type { Ticket } from "@/lib/studio-order/schema";

const base = {
  siparis_id: "ornek-studyo-2026-10-26-f1-r2",
  fikir_id: "idea-1",
  plan_hafta: "2026-10-26",
  hesap: "ornek-studyo",
  mod: "senaryo",
  sutun: "Deneme",
  istenen_saat: "2026-10-30 18:00",
  onay: true,
  durum: "taslak",
  senaryo: "Merhaba.",
} as unknown as Ticket;

describe("fiş dosyası: revize alanları", () => {
  it("iki nokta, # ve tırnak içeren not YAML'da bozulmadan gidip gelir", () => {
    const note = 'Açılış kısa: tek cümle # olsun, "bol" ve \'kısa\'';
    const text = writeTicket({ ...base, revize_notu: note, onceki_video: "ornek-studyo-2026-10-26-f1/final.mp4" }, "");
    expect(text).toContain("revize_notu:");
    const back = readTicket(text);
    expect(back.ticket).toMatchObject({ revize_notu: note, onceki_video: "ornek-studyo-2026-10-26-f1/final.mp4", siparis_id: "ornek-studyo-2026-10-26-f1-r2" });
  });
  it("revize alanı yoksa dosyada da yoktur (ilk sürüm değişmez)", () => {
    const text = writeTicket(base, "");
    expect(text).not.toContain("revize_notu");
    expect(text).not.toContain("onceki_video");
  });
});
