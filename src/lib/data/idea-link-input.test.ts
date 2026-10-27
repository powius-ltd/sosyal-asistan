import { describe, expect, it } from "vitest";

import { LINK_URL_MAX_LENGTH } from "@/lib/data/queries";
import { parseLinkIdeaToReelInput, parseReelShortcode, parseResolveIdeaLinkInput } from "@/lib/data/idea-link-input";

const CODE = "DdJy8QANttn";

describe("parseLinkIdeaToReelInput", () => {
  it("kimliği ve bağlantıyı kırpar", () => {
    expect(parseLinkIdeaToReelInput({ ideaId: " idea_1 ", url: `  https://www.instagram.com/reel/${CODE}/ ` })).toEqual({
      ideaId: "idea_1",
      url: `https://www.instagram.com/reel/${CODE}/`,
    });
  });

  it.each([
    ["boş girdi", undefined],
    ["fikir yok", { url: "https://www.instagram.com/reel/abcdef/" }],
    ["fikir boş", { ideaId: "  ", url: "https://www.instagram.com/reel/abcdef/" }],
    ["bağlantı yok", { ideaId: "i" }],
    ["bağlantı boş", { ideaId: "i", url: "   " }],
    ["bağlantı metin değil", { ideaId: "i", url: 42 }],
    ["bağlantı çok uzun", { ideaId: "i", url: "x".repeat(LINK_URL_MAX_LENGTH + 1) }],
  ])("geçersiz: %s → invalid_input", (_label, input) => {
    expect(() => parseLinkIdeaToReelInput(input)).toThrowError(expect.objectContaining({ name: "RepositoryError", code: "invalid_input" }));
  });
});

describe("parseResolveIdeaLinkInput", () => {
  it("confirm/reject kabul edilir", () => {
    expect(parseResolveIdeaLinkInput(" l1 ", "confirm")).toEqual({ linkId: "l1", decision: "confirm" });
    expect(parseResolveIdeaLinkInput("l1", "reject")).toEqual({ linkId: "l1", decision: "reject" });
  });

  it("bilinmeyen karar ve boş kimlik reddedilir", () => {
    expect(() => parseResolveIdeaLinkInput("l1", "approve")).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() => parseResolveIdeaLinkInput("", "confirm")).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
});

describe("parseReelShortcode", () => {
  it("Instagram bağlantısından kısa kodu çıkarır", () => {
    expect(parseReelShortcode("instagram", `https://www.instagram.com/reel/${CODE}/?igsh=x`)).toBe(CODE);
  });

  it("tanınmayan bağlantı → Türkçe invalid_input", () => {
    expect(() => parseReelShortcode("instagram", "https://example.com/reel/abcdef")).toThrowError(
      expect.objectContaining({ code: "invalid_input", message: expect.stringContaining("Instagram") }),
    );
  });

  it("modülü olmayan platform → invalid_input", () => {
    expect(() => parseReelShortcode("tiktok", "https://www.tiktok.com/@a/video/1")).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });
});
