/**
 * Bir içeriğin metin kanalları ve alıntı denetimi (`voice-profile`, `synthesize-week`, `generate-ideas` ortak kullanır).
 * Denetim `lib/intel/evidence.ts` `verifyEvidence`'ı YENİDEN KULLANIR (normalleştirme, kelime sınırı, ≥ 2 kelime kuralı orada tek
 * yerdedir); burada yalnız "tek alıntı, tek içerik" kısayolu ve Türkçe sebep metni vardır. Korpus = konuşma ∪ ekran yazısı ∪ açıklama.
 */
import "server-only";

import type { EvidenceFailure } from "@/lib/domain/intel";
import { verifyEvidence, type EvidenceCorpus } from "@/lib/intel/evidence";
import { wordTokens } from "@/lib/intel/normalize";

/** Bir içeriğin model girdisi/denetimi için metinleri. `id` = `content_items.id`. */
export interface ContentText {
  id: string;
  caption?: string;
  /** Konuşma transkripti. */
  transcript?: string;
  /** Ekrana basılan yazılar. */
  screenText?: string;
}

export function corpusOf(content: Pick<ContentText, "caption" | "transcript" | "screenText"> | undefined): EvidenceCorpus {
  return { speech: content?.transcript, screenText: content?.screenText, caption: content?.caption };
}

export const hasAnyText = (content: Pick<ContentText, "caption" | "transcript" | "screenText">): boolean =>
  [content.caption, content.transcript, content.screenText].some((text) => text !== undefined && text.trim() !== "");

const FAILURE_REASON: Record<EvidenceFailure, string> = {
  empty: "alıntı boş",
  too_short: "alıntı çok kısa (en az 2 kelime)",
  too_long: "alıntı çok uzun",
  not_found: "alıntı içeriğin metninde birebir bulunamadı",
  outside_first_quarter: "alıntı konuşmanın ilk bölümünde değil",
};

export type QuoteCheck = { ok: true } | { ok: false; reason: string };

/** `quote` bu içeriğin korpusunda birebir (normalleştirilmiş, kelime sınırında) geçiyor mu. */
export function checkQuote(content: ContentText | undefined, quote: string): QuoteCheck {
  if (content === undefined) return { ok: false, reason: "alıntının içeriği girdide yok" };
  const report = verifyEvidence(corpusOf(content), { sections: [{ type: "quote", quote }] });
  const failure = report.failures.find((check) => check.target === "section");
  return failure === undefined ? { ok: true } : { ok: false, reason: FAILURE_REASON[failure.failure ?? "not_found"] };
}

/** İfade (1+ kelime), metinde kelime sınırında ardışık geçiyor mu (normalleştirilmiş; `checkQuote`'un ≥ 2 kelime şartı yok). */
export function containsPhrase(text: string | undefined, phrase: string): boolean {
  const wanted = wordTokens(phrase);
  if (text === undefined || wanted.length === 0) return false;
  return ` ${wordTokens(text).join(" ")} `.includes(` ${wanted.join(" ")} `);
}

/** İfade, içeriğin herhangi bir kanalında (konuşma/ekran yazısı/açıklama) geçiyor mu. */
export const contentContainsPhrase = (content: ContentText, phrase: string): boolean =>
  [content.transcript, content.screenText, content.caption].some((text) => containsPhrase(text, phrase));

/**
 * Çıktı id'leri ↔ girdi id'leri BİREBİR eşit olmalı (eksik/fazla/yinelenen yok): sorun metni (Türkçe) ya da undefined.
 * `what` sorun metnindeki adlandırma ("id'ler", "ref'ler").
 */
export function idSetProblem(expected: readonly string[], actual: readonly string[], what = "id"): string | undefined {
  const want = new Set(expected);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of actual) (seen.has(id) ? duplicates : seen).add(id);
  const missing = expected.filter((id) => !seen.has(id));
  const extra = [...seen].filter((id) => !want.has(id));
  const parts = [
    missing.length > 0 ? `eksik ${what}: ${missing.join(", ")}` : "",
    extra.length > 0 ? `girdide olmayan ${what}: ${extra.join(", ")}` : "",
    duplicates.size > 0 ? `birden fazla dönen ${what}: ${[...duplicates].join(", ")}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? `Çıktıdaki ${what} kümesi girdiyle birebir aynı olmalı (${parts.join("; ")}).` : undefined;
}

/** id → öğe haritası (aynı id ikinci kez gelirse ilki kalır). */
export function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) if (!map.has(item.id)) map.set(item.id, item);
  return map;
}
