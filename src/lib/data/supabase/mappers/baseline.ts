/**
 * "Bu lift neden böyle?" açıklaması: `content_items.baseline_*` sütunlarından (skorla AYNI hesaplama anında saklanır)
 * `BaselineExplanation`'a. Okurken YENİDEN HESAPLANMAZ; yalnız saklanan jsonb doğrulanıp eşlenir. Ölçülemedi sebebi
 * (`unmeasuredReason`) saklanmaz, saklanan alanlardan türetilir (mock `scoring.ts` ile aynı metinler).
 */
import { z } from "zod";

import type { BaselineExcludedCounts, BaselineExplanation } from "@/lib/domain/content";
import type { ContentFormat, ViewsKind } from "@/lib/platforms/types";
import { BASELINE_DEFAULTS } from "@/lib/metrics";
import type { Json } from "@/lib/supabase/database.types";

const count = z.number().int().nonnegative().catch(0);

const excludedSchema = z.object({
  self: count,
  otherFormat: count,
  pinned: count,
  noViews: count,
  differentViewsKind: count,
  noDate: count,
  tooYoung: count,
});

const basisSchema = z.array(
  z.object({
    contentItemId: z.string(),
    views: z.number().nonnegative(),
    publishedAt: z.string().optional(),
  }),
);

/** Saklanan sayaçlar; henüz skorlanmamış içerikte (NULL/biçimsiz) hepsi 0. */
export function parseExcluded(value: Json | null): BaselineExcludedCounts {
  const parsed = excludedSchema.safeParse(value ?? {});
  return parsed.success
    ? parsed.data
    : { self: 0, otherFormat: 0, pinned: 0, noViews: 0, differentViewsKind: 0, noDate: 0, tooYoung: 0 };
}

/** Saklanan baz çizgisi içerikleri (yeniden eskiye); biçimsiz kayıt boş sayılır. */
export function parseBasis(value: Json | null): BaselineExplanation["basis"] {
  const parsed = basisSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data.map((b) => ({ contentItemId: b.contentItemId, views: b.views, publishedAt: b.publishedAt })) : [];
}

interface ReasonInput {
  lift: number | null;
  views?: number;
  viewsKind?: ViewsKind;
  format: ContentFormat;
  ownerKind: "own" | "competitor";
  median?: number;
  n: number;
}

/** Lift hesaplanamadıysa neden (ekranda "Neden tutan?" kartı); hesaplandıysa undefined. */
export function unmeasuredReason(input: ReasonInput): string | undefined {
  if (input.lift !== null) return undefined;
  if (input.views === undefined) {
    return input.ownerKind === "competitor" && input.format !== "short_video"
      ? "Instagram karusel ve görsel gönderilerde herkese açık izlenme sayısı vermiyor; baz çizgisi ve lift hesaplanamaz."
      : "Bu içerikte izlenme ölçülemedi; baz çizgisi ve lift hesaplanamaz.";
  }
  if (input.viewsKind === undefined) {
    return "İzlenme türü bilinmiyor: farklı türler karıştırılamayacağı için baz çizgisi ve lift hesaplanamaz.";
  }
  if (input.n === 0) return "Aynı hesapta aynı format ve izlenme türünde 3 günden eski, sabitlenmemiş başka içerik yok.";
  if (input.median === undefined || !(input.median > 0)) {
    return "Baz çizgisinin medyan izlenmesi 0: izlenme bu değere bölünemediği için lift hesaplanamaz.";
  }
  return "Skor henüz hesaplanmadı (bir sonraki skorlamayı bekliyor).";
}

/** Baz çizgisi penceresi ve düşük güven eşiği (`lib/metrics` sabitleriyle aynı). */
export const BASELINE_WINDOW = BASELINE_DEFAULTS.window;
export const BASELINE_MIN_N = BASELINE_DEFAULTS.minN;
