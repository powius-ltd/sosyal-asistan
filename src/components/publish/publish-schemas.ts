/**
 * Yayın server action'larının zod şemaları. Sunucu action'ları doğrudan POST ile de çağrılabilir;
 * bu yüzden istemcideki kontroller ne olursa olsun burada yeniden doğrulanır.
 */
import { z } from "zod";

import { advertiserNameSchema, trialSchema } from "@/lib/data/publish-input";
import { captionLimitProblem, captionRequiredProblem } from "@/lib/domain/publish";

export const jobIdSchema = z.object({
  jobId: z.string({ error: "Yayın işi seçilmedi." }).trim().min(1, "Yayın işi seçilmedi.").max(100, "Geçersiz yayın işi."),
});

/** `<input type="datetime-local">` biçimi: yerel (workspace saat diliminde) tarih-saat. */
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const createPublishJobSchema = z
  .object({
    socialAccountId: z
      .string({ error: "Hesap seç." })
      .trim()
      .min(1, "Hesap seç.")
      .max(100, "Geçersiz hesap."),
    caption: z
      .string({ error: "Açıklama metin olmalı." })
      // Sınır kuralı (2200 kod noktası, 30 hashtag) tek yerde: `captionLimitProblem` (depo da aynısını uygular).
      .superRefine((v, ctx) => {
        const problem = captionLimitProblem(v);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      }),
    /** Boş = onaydan sonra hemen. */
    scheduledAt: z
      .string({ error: "Planlanan zaman geçersiz." })
      .refine((v) => v === "" || LOCAL_DATETIME.test(v), "Planlanan zaman geçersiz."),
    paidPartnership: z.boolean({ error: "Geçersiz seçim." }),
    aiGenerated: z.boolean({ error: "Geçersiz seçim." }),
    /** Reklam veren adı (kırpılır; boş = yok). Doğrulama depoyla aynı şemadır (`publish-input.ts`). */
    advertiserName: advertiserNameSchema,
    /** Trial Reels; verilmezse normal yayın. Doğrulama depoyla aynı şemadır (`publish-input.ts`). */
    trial: trialSchema,
    status: z.enum(["draft", "awaiting_approval"], { error: "Yeni iş yalnız taslak ya da onay bekliyor olabilir." }),
  })
  .superRefine((value, ctx) => {
    const problem = value.status === "awaiting_approval" ? captionRequiredProblem(value.caption) : undefined;
    if (problem) ctx.addIssue({ code: "custom", path: ["caption"], message: problem });
  });

export type CreatePublishJobFormValues = z.input<typeof createPublishJobSchema>;

/** "Kopyala ve düzelt": eski işin kimliği + yeni işin alanları (yeni iş `createPublishJobSchema` ile aynı kuralları taşır). */
export const replacePublishJobSchema = z.object({
  replacesJobId: jobIdSchema.shape.jobId,
  job: createPublishJobSchema,
});
