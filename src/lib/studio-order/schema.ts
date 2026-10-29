/**
 * Sipariş fişi şeması (stüdyonun `docs/kurgu/SIPARIS.md` v2'si; çelişkide o kazanır). Anahtarlar Türkçe, fiş YAML frontmatter + serbest not.
 * Okuma: `frontmatter.ts` her değeri metin olarak verir; burada `evet/hayir` mantıksala, sayı metni sayıya çevrilir. Boş değer alan yok sayılır.
 * Panel yalnız yeni fiş (`durum: taslak`, `onay: hayir`) ve `paylasildi` + `zernio_post_id` + `yayin_url` yazar; stüdyo yalnız
 * `durum`, `video`, `kapak`, `hata_notu` yazar.
 */
import { z } from "zod";

import { isValidIstanbulStamp } from "@/lib/studio-order/time";

export const ORDER_MODES = ["senaryo", "konu"] as const;
export type OrderMode = (typeof ORDER_MODES)[number];
export const ORDER_STATUSES = ["taslak", "uretiliyor", "uretildi", "hata", "paylasildi"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_KINDS = ["broll", "animasyon", "karisik", "anlatim", "ugc"] as const;

/** Reels için tek sert sınır platformunki (Zernio belgesi): 3 sn – 15 dk. */
export const MIN_TARGET_SEC = 3;
export const MAX_TARGET_SEC = 15 * 60;

const yesNo = z.preprocess((v) => (v === "evet" ? true : v === "hayir" ? false : v), z.boolean());
const num = z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number().finite());
const posNum = z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number().finite().positive());
const count = z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number().int().nonnegative());
const text = z.string().trim().min(1);

/** `ornek_video.bicim`: ölçülemeyen alan YAZILMAZ, 0 yazılmaz (`undefined ≠ 0`). */
export const bicimSchema = z.strictObject({
  sure_sn: posNum.optional(),
  kesme: count.optional(),
  ort_plan_sn: posNum.optional(),
  tempo: z.enum(["yavas", "orta", "hizli"]).optional(),
  ilk_3sn_kesim: count.optional(),
  ekran_yazisi: count.optional(),
  yazi_konumu: z.enum(["ust", "orta", "alt"]).optional(),
  yazi_satir: posNum.optional(),
  yerlesim: z.enum(["tam", "bolunmus", "ekran_kaydi"]).optional(),
  acilis_kanali: z.enum(["konusma", "ekran_yazisi"]).optional(),
  acilis_turu: text.optional(),
  acilis_gorseli: z.enum(["yuz", "urun", "ekran", "broll"]).optional(),
  yuz: yesNo.optional(),
  muzik: yesNo.optional(),
  gomulu_altyazi: yesNo.optional(),
  analiz_surumu: text.optional(),
});
export type Bicim = z.infer<typeof bicimSchema>;

export const ornekVideoSchema = z.strictObject({
  url: z.url().optional(),
  dosya: text.optional(),
  bicim: bicimSchema.optional(),
});

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export const ticketSchema = z
  .strictObject({
    siparis_id: z.string().regex(SLUG, "siparis_id küçük harf, rakam ve tireden oluşmalı"),
    fikir_id: text.optional(),
    plan_hafta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slot: text.optional(),
    hesap: z.string().regex(SLUG),
    mod: z.enum(ORDER_MODES),
    tur: z.enum(ORDER_KINDS).optional(),
    sutun: text,
    istenen_saat: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "istenen_saat İstanbul saati olarak 'YYYY-AA-GG SS:DD' olmalı").refine(isValidIstanbulStamp, "istenen_saat geçerli bir tarih ve saat olmalı"),
    /** Stüdyonun üretime başlayacağı saat (isteğe bağlı; yoksa stüdyo kendi sırasıyla üretir). */
    uretim_saati: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "uretim_saati İstanbul saati olarak 'YYYY-AA-GG SS:DD' olmalı").refine(isValidIstanbulStamp, "uretim_saati geçerli bir tarih ve saat olmalı").optional(),
    onay: yesNo,
    durum: z.enum(ORDER_STATUSES),
    hedef: text.optional(),
    hedef_sure_sn: num.pipe(z.number().min(MIN_TARGET_SEC).max(MAX_TARGET_SEC)).optional(),
    hedef_sure_gerekce: text.optional(),
    cta: text.optional(),
    kaynak_link: z.url().optional(),
    konu: text.optional(),
    ana_hat: z.array(text).min(1).optional(),
    senaryo: z.string().trim().min(1).optional(),
    ornek_video: ornekVideoSchema.optional(),
    /** Revize (SPN-36): müşterinin notu ve revize edilen önceki sürümün videosu. Not yoksa alan yazılmaz (stüdyo davranışı değişmez). */
    revize_notu: text.optional(),
    onceki_video: text.optional(),
    video: text.optional(),
    kapak: text.optional(),
    hata_notu: text.optional(),
    zernio_post_id: text.optional(),
    yayin_url: text.optional(),
  })
  .superRefine((t, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (t.mod === "senaryo" && t.senaryo === undefined) issue("senaryo", "mod senaryo ise senaryo metni zorunlu");
    if (t.mod === "konu") {
      if (t.konu === undefined) issue("konu", "mod konu ise konu zorunlu");
      if (t.ana_hat === undefined) issue("ana_hat", "mod konu ise ana_hat zorunlu");
      if (t.hesap === "ornek-studyo") issue("mod", "ornek-studyo şimdilik konu kabul etmez (senaryo olmalı)");
    }
    if (t.uretim_saati !== undefined && t.uretim_saati > t.istenen_saat) issue("uretim_saati", "uretim_saati istenen_saat'ten sonra olamaz");
    if (t.hedef_sure_sn !== undefined && t.hedef_sure_gerekce === undefined) issue("hedef_sure_gerekce", "hedef_sure_sn varsa gerekçesi de yazılmalı");
  });

export type Ticket = z.infer<typeof ticketSchema>;
