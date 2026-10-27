import { describe, expect, it } from "vitest";

import { createPublishJobSchema, jobIdSchema } from "@/components/publish/publish-schemas";
import { CAPTION_MAX, countCaptionChars, countHashtags } from "@/lib/domain/publish";

const valid = {
  socialAccountId: "oa_1",
  caption: "V60'ta 3 hata #v60",
  scheduledAt: "2026-10-05T14:30",
  paidPartnership: false,
  aiGenerated: false,
  status: "draft",
};

describe("yayın sınırları", () => {
  it("karakteri kod noktası olarak sayar (emoji 1)", () => {
    expect(countCaptionChars("kahve ☕")).toBe(7);
    expect(countCaptionChars("👍👍")).toBe(2);
  });

  it("hashtag sayar: kelime içi '#' ve HTML varlığı sayılmaz", () => {
    expect(countHashtags("#v60 #bahçekafe ve #kahve_keyfi")).toBe(3);
    expect(countHashtags("a#b &#39; fiyat 5#")).toBe(0);
    expect(countHashtags("")).toBe(0);
  });

});

describe("createPublishJobSchema", () => {
  it("geçerli girdiyi kabul eder; planlanan zaman boş olabilir", () => {
    expect(createPublishJobSchema.safeParse(valid).success).toBe(true);
    expect(createPublishJobSchema.safeParse({ ...valid, scheduledAt: "" }).success).toBe(true);
  });

  it("2200 karakterden uzun açıklamayı ve 30'dan çok hashtag'i reddeder", () => {
    const long = createPublishJobSchema.safeParse({ ...valid, caption: "a".repeat(CAPTION_MAX + 1) });
    expect(long.success).toBe(false);
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(createPublishJobSchema.safeParse({ ...valid, caption: tags }).success).toBe(false);
    expect(createPublishJobSchema.safeParse({ ...valid, caption: "a".repeat(CAPTION_MAX) }).success).toBe(true);
  });

  it("onaya göndermek için açıklama şart; taslak için değil", () => {
    expect(createPublishJobSchema.safeParse({ ...valid, caption: "  ", status: "awaiting_approval" }).success).toBe(false);
    expect(createPublishJobSchema.safeParse({ ...valid, caption: "", status: "draft" }).success).toBe(true);
  });

  it("taslak/onay bekliyor dışındaki durumu ve bozuk tarihi reddeder", () => {
    expect(createPublishJobSchema.safeParse({ ...valid, status: "approved" }).success).toBe(false);
    expect(createPublishJobSchema.safeParse({ ...valid, status: "published" }).success).toBe(false);
    expect(createPublishJobSchema.safeParse({ ...valid, scheduledAt: "yarın" }).success).toBe(false);
    expect(createPublishJobSchema.safeParse({ ...valid, socialAccountId: "" }).success).toBe(false);
  });

  it("reklam veren adı kırpılır, boş ad 'yok' olur, 100 karakteri aşan ad reddedilir; alan verilmezse de geçerli", () => {
    const named = createPublishJobSchema.safeParse({ ...valid, advertiserName: "  Notion Türkiye " });
    expect(named.success && named.data.advertiserName).toBe("Notion Türkiye");
    const blank = createPublishJobSchema.safeParse({ ...valid, advertiserName: "   " });
    expect(blank.success && blank.data.advertiserName).toBeUndefined();
    expect(createPublishJobSchema.safeParse(valid).success).toBe(true);
    expect(createPublishJobSchema.safeParse({ ...valid, advertiserName: "a".repeat(101) }).success).toBe(false);
    expect(createPublishJobSchema.safeParse({ ...valid, advertiserName: 5 }).success).toBe(false);
  });

  it("Trial Reels: geçerli mezuniyet kabul edilir; bilinmeyen strateji ve fazladan alan reddedilir", () => {
    const ok = createPublishJobSchema.safeParse({ ...valid, trial: { enabled: true, graduation: "performance" } });
    expect(ok.success && ok.data.trial).toEqual({ enabled: true, graduation: "performance" });
    expect(createPublishJobSchema.safeParse({ ...valid, trial: { enabled: true, graduation: "auto" } }).success).toBe(false);
    expect(createPublishJobSchema.safeParse({ ...valid, trial: { enabled: "evet", graduation: "manual" } }).success).toBe(false);
    expect(createPublishJobSchema.safeParse({ ...valid, trial: { enabled: true, graduation: "manual", extra: 1 } }).success).toBe(false);
  });

  it("jobIdSchema boş kimliği reddeder", () => {
    expect(jobIdSchema.safeParse({ jobId: "pj_2" }).success).toBe(true);
    expect(jobIdSchema.safeParse({ jobId: " " }).success).toBe(false);
  });
});
