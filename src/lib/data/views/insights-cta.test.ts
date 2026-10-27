import { describe, expect, it } from "vitest";

import { classifyCta } from "@/lib/data/views/insights-cta";

describe("classifyCta", () => {
  it("yorum-anahtar-kelime: büyük harfli kelime (gerçek örnekler: FUTURE SELF, RENEW)", () => {
    expect(classifyCta("Ready to step in? Comment FUTURE SELF and I'll send you the workshop link.")).toBe("comment_keyword");
    expect(classifyCta("Comment RENEW below 👇")).toBe("comment_keyword");
    expect(classifyCta("Comment 'ALIGN' and I will DM you")).toBe("comment_keyword");
    expect(classifyCta("Yoruma KOÇ yaz, sana gönderelim")).toBe("comment_keyword");
  });

  it("küçük harfli 'comment below' ve 'Comment BELOW' anahtar kelime çağrısı DEĞİL", () => {
    expect(classifyCta("Comment below if you agree")).toBe("none");
    expect(classifyCta("Comment BELOW your thoughts")).toBe("none");
  });

  it("dm, görüşme, bio bağlantısı, kaydet/paylaş, takip", () => {
    expect(classifyCta("DM me 'hello' to start")).toBe("dm");
    expect(classifyCta("Book your free discovery call today")).toBe("book_call");
    expect(classifyCta("Link in bio to join the circle")).toBe("link_in_bio");
    expect(classifyCta("Save this for later and share it with a friend")).toBe("save_share");
    expect(classifyCta("Follow for more daily resets")).toBe("follow");
  });

  it("Türkçe kalıplar (İ/ı katlamasıyla)", () => {
    expect(classifyCta("Biyografideki linkten başvur")).toBe("link_in_bio");
    expect(classifyCta("Bu videoyu KAYDET")).toBe("save_share");
    expect(classifyCta("Ücretsiz randevu al")).toBe("book_call");
  });

  it("öncelik: yorum > dm > görüşme > bio > kaydet > takip", () => {
    expect(classifyCta("Comment RENEW, or DM me, link in bio, follow")).toBe("comment_keyword");
    expect(classifyCta("DM me or use the link in bio")).toBe("dm");
    expect(classifyCta("Book a discovery call, link in bio")).toBe("book_call");
    expect(classifyCta("Link in bio. Save this. Follow.")).toBe("link_in_bio");
  });

  it("çağrısı olmayan açıklama 'none'; açıklama yok/boş → undefined (CTA bilinmiyor, none değil)", () => {
    expect(classifyCta("A quiet morning routine that changed everything.")).toBe("none");
    expect(classifyCta(undefined)).toBeUndefined();
    expect(classifyCta("   ")).toBeUndefined();
  });
});
