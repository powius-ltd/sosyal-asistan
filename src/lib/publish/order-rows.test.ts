import { describe, expect, it } from "vitest";

import { isOrderPublishRow, pickOrderAccountId } from "@/lib/publish/order-rows";

const handles = new Map([["acc-1", "ornekstudyoapp"]]);
const base = { order_id: "s1", media_path: "siparis:ornek-studyo/2026-10-19/s1/final.mp4", social_account_id: "acc-1" };

describe("isOrderPublishRow (publish işi ile halka okuyucusunun ortak süzgeci)", () => {
  it("tutamaklı kendi hesap + siparis: medya + order_id → sayılır", () => {
    expect(isOrderPublishRow(base, handles)).toBe(true);
  });
  it("tutamaksız (bilinmeyen) hesaba bağlı satır sayılmaz", () => {
    expect(isOrderPublishRow({ ...base, social_account_id: "acc-x" }, handles)).toBe(false);
    expect(isOrderPublishRow(base, new Map([["acc-1", ""]]))).toBe(false);
  });
  it("order_id ya da siparis: medyası olmayan satır sayılmaz", () => {
    expect(isOrderPublishRow({ ...base, order_id: null }, handles)).toBe(false);
    expect(isOrderPublishRow({ ...base, media_path: "w/x/video.mp4" }, handles)).toBe(false);
    expect(isOrderPublishRow({ ...base, media_path: null }, handles)).toBe(false);
  });
});

describe("pickOrderAccountId (k3)", () => {
  const ig = (id: string, connection = "public_only") => ({ id, platform: "instagram", connection });
  it("tam bir yayına açık Instagram hesabı varsa o; birden çok ya da hiç yoksa undefined", () => {
    expect(pickOrderAccountId([ig("a")], true)).toBe("a");
    expect(pickOrderAccountId([ig("a"), ig("b")], true)).toBeUndefined();
    expect(pickOrderAccountId([ig("a", "connected"), ig("b", "connected")], false)).toBeUndefined();
    expect(pickOrderAccountId([ig("a")], false)).toBeUndefined();
    expect(pickOrderAccountId([{ id: "t", platform: "tiktok", connection: "connected" }, ig("a", "connected")], false)).toBe("a");
  });
});
