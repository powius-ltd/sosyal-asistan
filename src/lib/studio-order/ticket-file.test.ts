import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { StudioAccountError, studioAccountOf } from "@/lib/studio-order/accounts";
import { parseFrontmatter, setFrontmatterFields } from "@/lib/studio-order/frontmatter";
import type { Ticket } from "@/lib/studio-order/schema";
import { SAAS_ORDERS_DIR } from "@/lib/studio-order/order-root";
import { readTicket, writeTicket } from "@/lib/studio-order/ticket-file";
import { istanbulStamp } from "@/lib/studio-order/time";

const BASE: Ticket = {
  siparis_id: "ornek-studyo-2026-10-19-s1",
  fikir_id: "8dac0c83-78b2-46df-ae5d-8065b0c2309f",
  plan_hafta: "2026-10-19",
  slot: "S1",
  hesap: "ornek-studyo",
  mod: "senaryo",
  sutun: "teknik",
  istenen_saat: "2026-10-26 12:00",
  onay: false,
  durum: "taslak",
  hedef: "uyarla: tutan kanca",
  hedef_sure_sn: 25,
  hedef_sure_gerekce: "tutan rakipler 20–30 sn: # işareti ve iki nokta: var",
  senaryo: 'Patron: "Bunu yapay zekâyla hallet."\nSen: ...\n\nOtuz saniye. Tablo hazır.',
  ornek_video: {
    url: "https://www.instagram.com/reel/ABC123/",
    bicim: { sure_sn: 27.1, kesme: 26, tempo: "hizli", ekran_yazisi: 6, yuz: false, muzik: true, gomulu_altyazi: false, acilis_turu: "soru", ilk_3sn_kesim: 0 },
  },
};

describe("fiş yaz ∘ oku", () => {
  it("senaryo fişi kimlik döner (iç içe nesne, evet/hayir, blok metin, tırnaklı değer)", () => {
    const text = writeTicket(BASE, "Not satırı.\nDiğer açılış adayları: …");
    const back = readTicket(text);
    expect(back.ticket).toEqual({ ...BASE, senaryo: BASE.senaryo?.trim() });
    expect(back.note).toBe("Not satırı.\nDiğer açılış adayları: …");
    expect(text).toContain("onay: hayir");
    expect(text).toContain("yuz: hayir");
    expect(text).toMatch(/^video:$/m); // stüdyonun yazacağı alanlar görünür
  });

  it("konu fişi ana_hat listesiyle kimlik döner", () => {
    const konu: Ticket = { ...BASE, hesap: "ornek-marka", mod: "konu", senaryo: undefined, konu: "Basketbol nasıl doğdu?", ana_hat: ["Açılış: Voleybol sakin olsun diye icat edildi", "1891: şeftali sepeti"] };
    const back = readTicket(writeTicket(konu, ""));
    expect(back.ticket.ana_hat).toEqual(konu.ana_hat);
    expect(back.ticket.konu).toBe(konu.konu);
  });

  it("şemadan geçmeyen fişi yazmaz: ornek-studyo + konu, senaryosuz senaryo modu, süre sınırı", () => {
    expect(() => writeTicket({ ...BASE, mod: "konu", senaryo: undefined, konu: "x", ana_hat: ["a"] }, "")).toThrow(/ornek-studyo/);
    expect(() => writeTicket({ ...BASE, senaryo: undefined }, "")).toThrow(/senaryo/);
    expect(() => writeTicket({ ...BASE, hedef_sure_sn: 2 }, "")).toThrow();
    expect(() => writeTicket({ ...BASE, hedef_sure_sn: 901 }, "")).toThrow();
    expect(writeTicket({ ...BASE, hedef_sure_sn: 900 }, "")).toContain("hedef_sure_sn: 900");
  });
});

describe("uretim_saati (isteğe bağlı)", () => {
  it("varsa istenen_saat'in hemen ardından yazılır ve geri okunur; yoksa satır çıkmaz", () => {
    const text = writeTicket({ ...BASE, uretim_saati: "2026-10-26 08:30" }, "");
    expect(readTicket(text).ticket.uretim_saati).toBe("2026-10-26 08:30");
    expect(text).toMatch(/^istenen_saat: 2026-10-26 12:00\nuretim_saati: 2026-10-26 08:30$/m);
    expect(writeTicket(BASE, "")).not.toContain("uretim_saati");
  });

  it("biçim dışı ya da istenen saatten sonraki üretim saati reddedilir", () => {
    expect(() => writeTicket({ ...BASE, uretim_saati: "26.10.2026 08:30" }, "")).toThrow(/uretim_saati/);
    expect(() => writeTicket({ ...BASE, uretim_saati: "2026-10-26 12:01" }, "")).toThrow(/sonra olamaz/);
    expect(writeTicket({ ...BASE, uretim_saati: "2026-10-26 12:00" }, "")).toContain("uretim_saati: 2026-10-26 12:00");
  });

  it("N5: var olmayan saat/tarih (25:99, 30 Şubat) hem istenen_saat hem uretim_saati için reddedilir", () => {
    expect(() => writeTicket({ ...BASE, istenen_saat: "2026-10-26 25:99" }, "")).toThrow(/istenen_saat/);
    expect(() => writeTicket({ ...BASE, istenen_saat: "2026-02-30 10:00" }, "")).toThrow(/istenen_saat/);
    expect(() => writeTicket({ ...BASE, uretim_saati: "2026-10-26 25:99" }, "")).toThrow(/uretim_saati/);
    expect(() => writeTicket({ ...BASE, uretim_saati: "2026-02-30 10:00" }, "")).toThrow(/uretim_saati/);
  });
});

describe("stüdyonun örnek fişleri okunur", () => {
  const MOCK = `${SAAS_ORDERS_DIR}/ornek-studyo/2026-10-26/mock-ornek-studyo-f13-patron.md`;
  it.skipIf(!existsSync(MOCK))("ornek-studyo mock fişi", () => {
    const { ticket } = readTicket(readFileSync(MOCK, "utf8"));
    expect(ticket).toMatchObject({ hesap: "ornek-studyo", mod: "senaryo", onay: false, durum: "taslak", hedef_sure_sn: 25, cta: "SEMİNER" });
    expect(ticket.ornek_video?.bicim).toMatchObject({ sure_sn: 27.1, tempo: "hizli", yuz: false, muzik: true });
    expect(ticket.senaryo).toContain("Patron:");
    expect(ticket.kaynak_link).toBeUndefined(); // boş değer alan yok sayılır
  });
});

describe("setFrontmatterFields", () => {
  it("tek satırlık alanı günceller, olmayanı ekler, gerisine dokunmaz", () => {
    const text = writeTicket({ ...BASE, durum: "uretildi", video: "x/final.mp4" }, "Not");
    const next = setFrontmatterFields(text, { durum: "paylasildi", zernio_post_id: "abc123", yayin_url: "https://www.instagram.com/reel/ZZZ/" });
    const back = readTicket(next);
    expect(back.ticket).toMatchObject({ durum: "paylasildi", zernio_post_id: "abc123", yayin_url: "https://www.instagram.com/reel/ZZZ/", video: "x/final.mp4" });
    expect(back.ticket.senaryo).toBe(readTicket(text).ticket.senaryo);
    expect(back.note).toBe("Not");
    expect(() => setFrontmatterFields(text, { senaryo: "yeni" })).toThrow(/tek satır/);
  });
  it("frontmatter yoksa açık hata", () => {
    expect(() => parseFrontmatter("merhaba")).toThrow(/frontmatter/);
  });
});

describe("hesap eşlemesi ve saat", () => {
  it("panel slug'ı stüdyo slug'ına ve moda çevrilir; bilinmeyen hesap açık hata", () => {
    expect(studioAccountOf("ornekstudyoapp")).toEqual({ studioSlug: "ornek-studyo", mode: "senaryo" });
    expect(studioAccountOf("ornek-marka").mode).toBe("konu");
    expect(() => studioAccountOf("ornek")).toThrow(StudioAccountError);
    expect(() => studioAccountOf(undefined)).toThrow(StudioAccountError);
  });
  it("UTC → İstanbul (UTC+3, yaz saati yok)", () => {
    expect(istanbulStamp("2026-10-19T17:00:00+00:00")).toBe("2026-10-19 20:00");
    expect(istanbulStamp("2026-10-19T21:30:00Z")).toBe("2026-10-20 00:30");
  });
});
