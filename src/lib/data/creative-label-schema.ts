/**
 * Kreatif etiket (açı × farkındalık katmanı) yazma sözleşmesi — TEK tanım. `label:angles` (M1) aynı alan şemasıyla LLM çıktısını
 * doğrular (`CREATIVE_LABEL_FIELDS`) ve DB'ye yazmadan ÖNCE satırı doğrular (`creativeLabelRowSchema`); `content_creative_labels`
 * check'leri (migration 0011) ile aynı kurallardır. Tip uyumu derleme zamanında denetlenir (`z.ZodType<DbInsert>`): tablo değişirse
 * burası kırılır. Enum'lar `domain/creative-matrix.ts`'ten gelir (kullanıcının taksonomisi; kopya yok).
 *
 * Kurallar: alıntı BOŞ olamaz ve ≤ 300 karakter (kod noktası: DB `char_length` ile aynı); kaynakta birebir bulunup bulunmadığı
 * burada değil `lib/intel/evidence` denetiminde sınanır (sonucu `evidence_verified`); doğrulanmamış etiket saklanır ama matrise girmez.
 * Karar verilemeyen içerik için satır YAZILMAZ (rastgele hücre yok); bu şema "karar verildi" satırını doğrular.
 */
import { z } from "zod";

import { CREATIVE_ANGLE_IDS, CREATIVE_EVIDENCE_MAX_CHARS, FUNNEL_STAGE_IDS } from "@/lib/domain/creative-matrix";
import type { Database } from "@/lib/supabase/database.types";

type DbInsert = Database["public"]["Tables"]["content_creative_labels"]["Insert"];

export const CREATIVE_ANGLE_SCHEMA = z.enum(CREATIVE_ANGLE_IDS);
export const FUNNEL_STAGE_SCHEMA = z.enum(FUNNEL_STAGE_IDS);

/** Birebir alıntı: kırpılmış, boş olmayan, ≤ `CREATIVE_EVIDENCE_MAX_CHARS` kod noktası. */
export const CREATIVE_EVIDENCE_SCHEMA = z
  .string()
  .trim()
  .min(1, "Alıntı boş olamaz")
  .refine((text) => [...text].length <= CREATIVE_EVIDENCE_MAX_CHARS, `Alıntı en çok ${CREATIVE_EVIDENCE_MAX_CHARS} karakter olabilir`);

/**
 * Bir içeriğin etiket alanları (LLM çıktısının içerik başına bölümü ve DB sütunları AYNI adlarla): açı + katman ve her birinin alıntısı.
 * M1 LLM şemasına (kimlik/`unsure` gibi kendi alanlarıyla) bunu yerleştirir.
 */
export const CREATIVE_LABEL_FIELDS = z.object({
  angle: CREATIVE_ANGLE_SCHEMA,
  funnel_stage: FUNNEL_STAGE_SCHEMA,
  angle_evidence: CREATIVE_EVIDENCE_SCHEMA,
  funnel_evidence: CREATIVE_EVIDENCE_SCHEMA,
});

/** DB'ye yazılacak satır (`content_creative_labels` Insert; upsert anahtarı `content_item_id`). */
export const creativeLabelRowSchema: z.ZodType<DbInsert> = CREATIVE_LABEL_FIELDS.extend({
  content_item_id: z.string().min(1),
  workspace_id: z.string().min(1),
  /** Her iki alıntı kaynakta bulundu mu (açık yazılır, varsayılan yok). */
  evidence_verified: z.boolean(),
  prompt_version: z.string().trim().min(1),
  model: z.string().min(1).nullish(),
  /** Koşu yoksa (elle/test) yazılmaz ya da null. */
  run_id: z.string().min(1).nullish(),
  labeled_at: z.iso.datetime({ offset: true }).optional(),
});

export type CreativeLabelFields = z.infer<typeof CREATIVE_LABEL_FIELDS>;
