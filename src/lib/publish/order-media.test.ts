import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ORDER_VIDEO_MAX_BYTES, OrderMediaError, orderVideoProblem, resolveOrderMedia } from "@/lib/publish/order-media";
import { istanbulStampToUtc, zernioScheduledFor } from "@/lib/publish/order-time";
import { isPublishableAccount, workspaceHasZernioKey } from "@/lib/publish/publishable";

let root: string;
let outside: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "om-"));
  outside = mkdtempSync(join(tmpdir(), "om-dis-"));
  mkdirSync(join(root, "ornek-studyo", "w", "s1"), { recursive: true });
  writeFileSync(join(root, "ornek-studyo", "w", "s1", "final.mp4"), "v");
  writeFileSync(join(outside, "gizli.mp4"), "g");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe("resolveOrderMedia", () => {
  it("kök içindeki dosyayı çözer", () => {
    expect(resolveOrderMedia(root, "siparis:ornek-studyo/w/s1/final.mp4", "ornek-studyo")).toMatch(/final\.mp4$/);
  });
  it.each(["siparis:../x.mp4", "siparis:/etc/hosts", "siparis:ornek-studyo/../../x", "siparis:ornek-studyo//x", "x:ornek-studyo/w/s1/final.mp4"])("%s reddedilir", (p) => {
    expect(() => resolveOrderMedia(root, p, "ornek-studyo")).toThrow(OrderMediaError);
  });
  it("sembolik bağ kök dışına çıkamaz", () => {
    symlinkSync(outside, join(root, "ornek-studyo", "w", "link"));
    expect(() => resolveOrderMedia(root, "siparis:ornek-studyo/w/link/gizli.mp4", "ornek-studyo")).toThrow(/dışına/);
  });
  it("başka hesabın klasörü (../../baska/x.mp4 ya da baska/x.mp4) reddedilir", () => {
    mkdirSync(join(root, "baska", "w", "s1"), { recursive: true });
    writeFileSync(join(root, "baska", "w", "s1", "x.mp4"), "v");
    expect(() => resolveOrderMedia(root, "siparis:baska/w/s1/x.mp4", "ornek-studyo")).toThrow(/başka bir hesabın/);
    expect(() => resolveOrderMedia(root, "siparis:ornek-studyo/../../baska/x.mp4", "ornek-studyo")).toThrow(OrderMediaError);
    expect(resolveOrderMedia(root, "siparis:baska/w/s1/x.mp4", "baska")).toMatch(/x\.mp4$/);
  });
  it(".mp4 olmayan dosya reddedilir; 300 MB üstü boyut kuralı betikle ortaktır", () => {
    writeFileSync(join(root, "ornek-studyo", "w", "s1", "not.txt"), "v");
    expect(() => resolveOrderMedia(root, "siparis:ornek-studyo/w/s1/not.txt", "ornek-studyo")).toThrow(/mp4/);
    expect(orderVideoProblem("a.mp4", ORDER_VIDEO_MAX_BYTES)).toBeUndefined();
    expect(orderVideoProblem("a.mp4", ORDER_VIDEO_MAX_BYTES + 1)).toMatchObject({ code: "too_large" });
    expect(orderVideoProblem("a.mov", 10)).toMatchObject({ code: "invalid_type" });
  });
  it("olmayan dosya missing", () => {
    expect(() => resolveOrderMedia(root, "siparis:ornek-studyo/w/s1/yok.mp4", "ornek-studyo")).toThrow(/bulunamadı/);
  });
});

describe("order-time", () => {
  it("İstanbul saati ↔ UTC gidiş-dönüş", () => {
    const d = istanbulStampToUtc("2026-10-22 21:00");
    expect(d?.toISOString()).toBe("2026-10-22T18:00:00.000Z");
    expect(zernioScheduledFor(d as Date)).toBe("2026-10-22T21:00:00");
  });
  it("geçersiz biçim undefined", () => {
    expect(istanbulStampToUtc("2026-13-40 99:00")).toBeUndefined();
    expect(istanbulStampToUtc("yarın")).toBeUndefined();
  });
});

describe("publishable", () => {
  it("bağlı hesap ya da Zernio anahtarı olan çalışma alanı", () => {
    expect(isPublishableAccount({ connection: "connected" }, false)).toBe(true);
    expect(isPublishableAccount({ connection: "public_only" }, false)).toBe(false);
    expect(isPublishableAccount({ connection: "public_only" }, true)).toBe(true);
    expect(workspaceHasZernioKey("ornekstudyoapp", { ZERNIO_API_KEY_ORNEKSTUDYOAPP: "k" })).toBe(true);
    expect(workspaceHasZernioKey("ornekstudyoapp", {})).toBe(false);
  });
  it("genel anahtarla yalnız ornekstudyoapp yayınlanabilir; stüdyo hesabı (ornek) sayılmaz", () => {
    expect(workspaceHasZernioKey("ornekstudyoapp", { ZERNIO_API_KEY: "g" })).toBe(true);
    expect(workspaceHasZernioKey("ornek", { ZERNIO_API_KEY: "g" })).toBe(false);
    expect(workspaceHasZernioKey("ornek-hesap", { ZERNIO_API_KEY: "g" })).toBe(false);
  });
});
