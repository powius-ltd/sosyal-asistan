import { describe, expect, it } from "vitest";

import { withDative } from "@/components/chat/dative";

describe("withDative (ada yönelme eki)", () => {
  it.each([
    ["Maskot", "Maskot'a"],
    ["Demirkazık", "Demirkazık'a"],
    ["Ali", "Ali'ye"],
    ["Bora", "Bora'ya"],
    ["Zeynep", "Zeynep'e"],
    ["Selin", "Selin'e"],
    ["Ece", "Ece'ye"],
    ["Koç", "Koç'a"],
    ["Mümin", "Mümin'e"],
    ["Işık", "Işık'a"],
    ["İpek", "İpek'e"],
    ["Ada", "Ada'ya"],
  ])("%s → %s", (name, expected) => {
    expect(withDative(name)).toBe(expected);
  });

  it("ünlüsüz ad güvenli varsayılan 'a alır", () => {
    expect(withDative("Brr")).toBe("Brr'a");
  });
});
