/**
 * Koleksiyon girdilerinin doğrulaması: TÜM depo uygulamaları (mock, Supabase) ve server action'lar aynı şemaları
 * kullanır, kural tek yerde durur (`workspace-patch.ts` deseni). Sınırlar `lib/domain/collection.ts`'tedir.
 */
import { z } from "zod";

import {
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_MEMBERSHIP_IDS_MAX,
  COLLECTION_NAME_MAX,
  COLLECTION_NOTE_MAX,
} from "@/lib/domain/collection";
import type { CreateCollectionInput } from "@/lib/data/queries";
import { parseOrThrow } from "@/lib/data/parse-input";

const codePoints = (text: string) => Array.from(text).length;

/** Ad: kırpılır, 1..`COLLECTION_NAME_MAX` karakter (kod noktası). */
export const collectionNameSchema = z
  .string({ error: "Koleksiyon adı metin olmalı." })
  .trim()
  .min(1, "Koleksiyon adı boş olamaz.")
  .refine((text) => codePoints(text) <= COLLECTION_NAME_MAX, { error: `Koleksiyon adı en fazla ${COLLECTION_NAME_MAX} karakter olabilir.` });

/** Açıklama: kırpılır, en çok `COLLECTION_DESCRIPTION_MAX` karakter; boş metin açıklamayı yok sayar (undefined). */
export const collectionDescriptionSchema = z
  .string({ error: "Açıklama metin olmalı." })
  .trim()
  .refine((text) => codePoints(text) <= COLLECTION_DESCRIPTION_MAX, { error: `Açıklama en fazla ${COLLECTION_DESCRIPTION_MAX} karakter olabilir.` })
  .transform((text) => (text === "" ? undefined : text))
  .optional();

/** Öğe notu: kırpılır, en çok `COLLECTION_NOTE_MAX` karakter; "" notu siler (undefined = dokunma). */
export const collectionNoteSchema = z
  .string({ error: "Not metin olmalı." })
  .trim()
  .refine((text) => codePoints(text) <= COLLECTION_NOTE_MAX, { error: `Not en fazla ${COLLECTION_NOTE_MAX} karakter olabilir.` })
  .optional();

/** Toplu üyelik sorgusunun içerik kimlikleri: metin dizisi, en çok `COLLECTION_MEMBERSHIP_IDS_MAX` (tekrarlar sonra ayıklanır). */
export const membershipContentIdsSchema = z
  .array(z.string({ error: "İçerik kimliği metin olmalı." }).min(1, "İçerik kimliği boş olamaz."), { error: "İçerik kimlikleri liste olmalı." })
  .max(COLLECTION_MEMBERSHIP_IDS_MAX, `En çok ${COLLECTION_MEMBERSHIP_IDS_MAX} içerik sorgulanabilir.`);

export const createCollectionSchema = z.object({
  name: collectionNameSchema,
  description: collectionDescriptionSchema,
});

/** Depo uygulamaları için: geçersiz girdi `RepositoryError("invalid_input")` fırlatır; temiz (kırpılmış) girdiyi döndürür. */
export function parseCreateCollectionInput(input: unknown): CreateCollectionInput {
  return parseOrThrow(createCollectionSchema, input, "Geçersiz koleksiyon.");
}

export function parseCollectionName(input: unknown): string {
  return parseOrThrow(collectionNameSchema, input, "Geçersiz koleksiyon adı.");
}

/** Toplu üyelik girdisi: geçerliyse tekrarsız (ilk görülme sırasıyla) kimlik listesi; aksi `invalid_input`. */
export function parseMembershipContentIds(input: unknown): string[] {
  return [...new Set(parseOrThrow(membershipContentIdsSchema, input, "Geçersiz içerik listesi."))];
}

/** `undefined` = dokunma; "" = notu sil (dönen `""`); dolu metin kırpılmış döner. */
export function parseCollectionNote(input: unknown): string | undefined {
  return parseOrThrow(collectionNoteSchema, input, "Geçersiz not.");
}
