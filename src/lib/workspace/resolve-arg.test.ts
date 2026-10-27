import { describe, expect, it } from "vitest";

import { matchWorkspaceRef, splitWorkspaceArg } from "@/lib/workspace/resolve-arg";
import type { WorkspaceListItem } from "@/lib/workspace/registry-db";

const ORNEK: WorkspaceListItem = { id: "7a3f0000-0000-4000-8000-000000000001", name: "Ornek", slug: "ornek", accounts: [] };
const KAHVE: WorkspaceListItem = { id: "5cc27bf7-635a-4e00-975a-d18122f8de30", name: "Çiğdem'in Kahvesi", slug: "cigdemin-kahvesi", accounts: [] };
const KAHVE_2: WorkspaceListItem = { id: "5cc27bf7-1111-4e00-975a-d18122f8de31", name: "Başka Kahve", slug: "baska-kahve", accounts: [] };
const LIST = [ORNEK, KAHVE];

describe("splitWorkspaceArg", () => {
  it("--workspace değerini ayıklar, kalan argümanlar sırasıyla geri verilir", () => {
    expect(splitWorkspaceArg(["--dry-run", "--workspace=ornek", "--limit=5"])).toEqual({ workspace: "ornek", all: false, rest: ["--dry-run", "--limit=5"] });
    expect(splitWorkspaceArg(["--dry-run"])).toEqual({ all: false, rest: ["--dry-run"] });
    expect(splitWorkspaceArg([])).toEqual({ all: false, rest: [] });
  });

  it("değer boşluk içerebilir (ad ile seçim) ve kırpılır", () => {
    expect(splitWorkspaceArg(["--workspace= Çiğdem'in Kahvesi "]).workspace).toBe("Çiğdem'in Kahvesi");
  });

  it("boş değer, değersiz bayrak ve tekrar hata verir", () => {
    expect(() => splitWorkspaceArg(["--workspace="])).toThrowError(/boş olamaz/);
    expect(() => splitWorkspaceArg(["--workspace"])).toThrowError(/değer ister/);
    expect(() => splitWorkspaceArg(["--workspace=a", "--workspace=b"])).toThrowError(/bir kez/);
  });

  it("--all yalnız izin verilen komutta; --workspace ile birlikte olmaz", () => {
    expect(() => splitWorkspaceArg(["--all"])).toThrowError(/yalnız rutin/);
    expect(splitWorkspaceArg(["--all", "--dry-run"], { allowAll: true })).toEqual({ all: true, rest: ["--dry-run"] });
    expect(() => splitWorkspaceArg(["--all", "--workspace=ornek"], { allowAll: true })).toThrowError(/birlikte verilemez/);
  });
});

describe("matchWorkspaceRef", () => {
  it("tam kimlik, slug ve ad (Türkçe katlamalı) ile eşleşir", () => {
    expect(matchWorkspaceRef(ORNEK.id, LIST)).toBe(ORNEK);
    expect(matchWorkspaceRef(ORNEK.id.toUpperCase(), LIST)).toBe(ORNEK);
    expect(matchWorkspaceRef("cigdemin-kahvesi", LIST)).toBe(KAHVE);
    expect(matchWorkspaceRef("ORNEK", LIST)).toBe(ORNEK);
    expect(matchWorkspaceRef("çiğdem'in kahvesi", LIST)).toBe(KAHVE);
    expect(matchWorkspaceRef("CIGDEM'IN KAHVESI", LIST)).toBe(KAHVE);
  });

  it("kimlik öneki ancak ≥ 8 karakterse kabul edilir", () => {
    expect(matchWorkspaceRef("5cc27bf7", LIST)).toBe(KAHVE);
    expect(() => matchWorkspaceRef("5cc27b", LIST)).toThrowError(/Bilinmeyen çalışma alanı/);
  });

  it("bilinmeyen değer açık hata + mevcut çalışma alanlarının listesiyle reddedilir", () => {
    let message = "";
    try {
      matchWorkspaceRef("yok", LIST);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/Bilinmeyen çalışma alanı: "yok"/);
    expect(message).toContain("ornek · Ornek");
    expect(message).toContain(KAHVE.id);
  });

  it("boş kayıtta da açık hata verir", () => {
    expect(() => matchWorkspaceRef("ornek", [])).toThrowError(/hiç çalışma alanı yok/);
  });

  it("belirsiz eşleşme (aynı ad / aynı önek) reddedilir, tahmin edilmez", () => {
    const ayni = { ...KAHVE_2, name: KAHVE.name };
    expect(() => matchWorkspaceRef("Çiğdem'in Kahvesi", [KAHVE, ayni])).toThrowError(/birden çok/);
    expect(() => matchWorkspaceRef("5cc27bf7", [KAHVE, KAHVE_2])).toThrowError(/birden çok/);
    // slug eşleşmesi ada üstündür: tek slug varsa ad çakışması engel olmaz.
    expect(matchWorkspaceRef("cigdemin-kahvesi", [KAHVE, ayni])).toBe(KAHVE);
  });
});
