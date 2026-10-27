import { describe, expect, it } from "vitest";

import { splitTranscript } from "@/components/video/transcript-split";

const TEXT = "Evde V60 demlerken herkesin yaptığı üç hata var. Birincisi suyu çok sıcak kullanmak.";

describe("splitTranscript", () => {
  it("hook metni birebir bulunursa onu vurgular", () => {
    const parts = splitTranscript(TEXT, "Birincisi suyu çok sıcak kullanmak.");
    expect(parts.before).toBe("Evde V60 demlerken herkesin yaptığı üç hata var. ");
    expect(parts.hook).toBe("Birincisi suyu çok sıcak kullanmak.");
    expect(parts.after).toBe("");
  });

  it("hook metni yoksa ilk cümleyi vurgular", () => {
    const parts = splitTranscript(TEXT);
    expect(parts.hook).toBe("Evde V60 demlerken herkesin yaptığı üç hata var.");
    expect(parts.before).toBe("");
    expect(parts.after).toBe(" Birincisi suyu çok sıcak kullanmak.");
  });

  it("hook metni transcript'te bulunamazsa ilk cümleye düşer", () => {
    expect(splitTranscript(TEXT, "başka bir şey").hook).toBe("Evde V60 demlerken herkesin yaptığı üç hata var.");
  });

  it("parçalar birleşince metni aynen verir", () => {
    const { before, hook, after } = splitTranscript(`  ${TEXT}`);
    expect(before + hook + after).toBe(`  ${TEXT}`);
  });

  it("noktalamasız metinde vurgu yapmaz", () => {
    expect(splitTranscript("müzik müzik müzik")).toEqual({ before: "", hook: "", after: "müzik müzik müzik" });
  });
});
