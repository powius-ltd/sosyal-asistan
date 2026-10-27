import { describe, expect, it } from "vitest";

import { splitLeadSentence } from "@/components/briefing/lead-sentence";

describe("splitLeadSentence", () => {
  it("ilk cümleyi ve gerisini ayırır", () => {
    expect(splitLeadSentence("Videon 2,4 katına çıktı. Tek video: ikinci bir örnek bekle.")).toEqual({
      lead: "Videon 2,4 katına çıktı.",
      rest: "Tek video: ikinci bir örnek bekle.",
    });
  });

  it("tek cümlede gerisi boş", () => {
    expect(splitLeadSentence("Rakiplerin 6 videosu bu hücrede 3,1 kat aldı.")).toEqual({
      lead: "Rakiplerin 6 videosu bu hücrede 3,1 kat aldı.",
      rest: "",
    });
  });

  it("sıra numarası ve ondalık noktası cümleyi bölmez", () => {
    expect(splitLeadSentence("3. gün sonucu geldi. Normalinin 1,5 katı.")).toEqual({
      lead: "3. gün sonucu geldi.",
      rest: "Normalinin 1,5 katı.",
    });
    expect(splitLeadSentence("Videoların 3. gün itibarıyla %47,9 arttı.").rest).toBe("");
  });

  it("ünlem ve soru işaretinden de böler; boş metin boş döner", () => {
    expect(splitLeadSentence("Bir deneme değer? Evet.").lead).toBe("Bir deneme değer?");
    expect(splitLeadSentence("   ")).toEqual({ lead: "", rest: "" });
  });
});
