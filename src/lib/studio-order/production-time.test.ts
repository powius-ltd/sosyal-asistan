import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProductionTimeError, setOrderProductionTime } from "@/lib/studio-order/production-time";

const NOW = new Date("2026-10-20T10:00:00Z"); // İstanbul 13:00
let root: string;

const ticketText = (over: Record<string, string> = {}) => {
  const f: Record<string, string> = {
    siparis_id: "s1", plan_hafta: "2026-10-19", hesap: "ornek-studyo", mod: "senaryo", sutun: "x", istenen_saat: "2026-10-22 21:00", onay: "evet", durum: "taslak",
    senaryo: "Merhaba", ...over,
  };
  return `---\n${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\nserbest not\n`;
};

function addTicket(over: Record<string, string> = {}, studio = "ornek-studyo", id = "s1") {
  const week = join(root, studio, "2026-10-19");
  mkdirSync(week, { recursive: true });
  const path = join(week, `${id}.md`);
  writeFileSync(path, ticketText({ siparis_id: id, hesap: studio, ...over }));
  return path;
}

const set = (stamp: string, over: { studioSlug?: string; siparisId?: string } = {}) =>
  setOrderProductionTime({ root, studioSlug: over.studioSlug ?? "ornek-studyo", siparisId: over.siparisId ?? "s1", stamp, now: NOW });

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof ProductionTimeError ? error.code : "other";
  }
  return undefined;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "uretim-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("setOrderProductionTime", () => {
  it("taslak fişe yazar, geri okunur ve başka alan değişmez", () => {
    const path = addTicket();
    const before = readFileSync(path, "utf8");
    const { ticket } = set("2026-10-21 09:30");
    expect(ticket.uretim_saati).toBe("2026-10-21 09:30");
    const after = readFileSync(path, "utf8");
    expect(after).toContain("uretim_saati: 2026-10-21 09:30");
    expect(after.replace(/^uretim_saati: .*\n/m, "")).toBe(before);
  });

  it("var olan üretim saatini değiştirir", () => {
    const path = addTicket({ uretim_saati: "2026-10-21 08:00" });
    set("2026-10-21 10:00");
    expect(readFileSync(path, "utf8")).toMatch(/uretim_saati: 2026-10-21 10:00\n/);
    expect(readFileSync(path, "utf8").match(/uretim_saati/g)).toHaveLength(1);
  });

  it("taslak olmayan fişi reddeder ve dosyaya dokunmaz", () => {
    const path = addTicket({ durum: "uretildi", video: "s1/final.mp4" });
    const before = readFileSync(path, "utf8");
    expect(codeOf(() => set("2026-10-21 09:30"))).toBe("invalid_state");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("istenen yayın saatinden sonrasını reddeder", () => {
    addTicket();
    expect(codeOf(() => set("2026-10-22 21:01"))).toBe("invalid_input");
    expect(codeOf(() => set("2026-10-22 21:00"))).toBeUndefined();
  });

  it("geçmiş saati reddeder (İstanbul saatiyle)", () => {
    addTicket();
    expect(codeOf(() => set("2026-10-20 12:59"))).toBe("invalid_input");
    expect(codeOf(() => set("2026-10-20 13:00"))).toBeUndefined();
  });

  it("biçim bozuksa reddeder", () => {
    addTicket();
    expect(codeOf(() => set("yarın 9"))).toBe("invalid_input");
  });

  it("N5: biçimi tutan ama var olmayan saat/tarihi reddeder (25:99, 30 Şubat)", () => {
    const path = addTicket();
    const before = readFileSync(path, "utf8");
    expect(codeOf(() => set("2026-10-21 25:99"))).toBe("invalid_input");
    expect(codeOf(() => set("2026-02-30 10:00"))).toBe("invalid_input");
    expect(codeOf(() => set("2026-10-21 24:00"))).toBe("invalid_input");
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(codeOf(() => set("2026-10-21 23:59"))).toBeUndefined();
  });

  it("başka hesabın fişi ve kök dışı kimlik bulunamaz", () => {
    addTicket({}, "ornek-marka", "m1");
    expect(codeOf(() => set("2026-10-21 09:30", { siparisId: "m1" }))).toBe("not_found");
    expect(codeOf(() => set("2026-10-21 09:30", { siparisId: "../ornek-marka/2026-10-19/m1" }))).toBe("not_found");
    expect(codeOf(() => set("2026-10-21 09:30", { studioSlug: ".." }))).toBe("not_found");
    expect(codeOf(() => set("2026-10-21 09:30", { siparisId: "yok" }))).toBe("not_found");
  });

  it("N4: hafta klasörü ya da fiş kök dışına sembolik bağsa bulunamaz, kök dışına yazılmaz", () => {
    const outside = mkdtempSync(join(tmpdir(), "dis-"));
    try {
      const studio = join(root, "ornek-studyo");
      mkdirSync(studio, { recursive: true });
      // dışarıda gerçek bir hafta klasörü + fiş; kök içinden yalnız sembolik bağ
      mkdirSync(join(outside, "2026-10-19"), { recursive: true });
      const outTicket = join(outside, "2026-10-19", "s1.md");
      writeFileSync(outTicket, ticketText());
      symlinkSync(join(outside, "2026-10-19"), join(studio, "2026-10-19"));
      const before = readFileSync(outTicket, "utf8");
      expect(codeOf(() => set("2026-10-21 09:30"))).toBe("not_found");
      expect(readFileSync(outTicket, "utf8")).toBe(before);
      rmSync(join(studio, "2026-10-19"));
      // hafta klasörü içeride, fişin kendisi dışarıya bağ
      mkdirSync(join(studio, "2026-10-19"));
      symlinkSync(outTicket, join(studio, "2026-10-19", "s1.md"));
      expect(codeOf(() => set("2026-10-21 09:30"))).toBe("not_found");
      expect(readFileSync(outTicket, "utf8")).toBe(before);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
