/**
 * Açıklamadan kural tabanlı CTA (harekete çağrı) türü — LLM yok. Mock ve Supabase `getInsights` AYNI sınıflayıcıyı kullanır.
 * Öncelik sırası `CTA_TYPES` sırasıdır (bir açıklamada birden çok çağrı varsa ilk eşleşen kazanır). İngilizce + Türkçe kalıplar.
 * Bu en küçük doğru sürümdür: kalıp listesi genişletilirse (yeni dil/kalıp) yalnız burası değişir, testle.
 */
import type { CtaType } from "@/lib/domain/taxonomy";
import { foldTurkish } from "@/lib/text";

/**
 * Yorum-anahtar-kelime CTA'sı: "Comment RENEW", "Comment 'FUTURE SELF'", "Yoruma KOÇ yaz". Anahtar kelime BÜYÜK HARFLİDİR
 * (küçük harfli "comment below" bir kelime çağrısı değildir); orijinal metinde aranır (katlanmış metinde büyük harf kalmaz).
 * `\b` yerine Unicode harf bakışları kullanılır: Türkçe büyük harfler (Ç, Ğ, İ, Ö, Ş, Ü) `\w` dışıdır.
 */
const COMMENT_KEYWORD =
  /(?<!\p{L})(?:[Cc]omment|COMMENT|[Yy]orum(?:a|unuza)?|YORUM(?:A)?)(?!\p{L})[^\n]{0,25}?(?<!\p{L})(\p{Lu}{2,})(?!\p{L})/gu;

/** Büyük harfli ama anahtar kelime olmayan sözcükler ("Comment BELOW", "Comment below or DM me"). */
const NOT_A_KEYWORD = new Set(["BELOW", "HERE", "NOW", "DOWN", "DM", "DMS", "AND", "OR", "THE", "FOR", "YOU", "YOUR", "WITH", "ALTINA", "AŞAĞI"]);

/** Katlanmış (küçük harf, aksansız) metinde aranan kalıplar; sıra = öncelik. */
const FOLDED_PATTERNS: readonly [Exclude<CtaType, "comment_keyword" | "none">, RegExp][] = [
  ["dm", /\bdm\s+me\b|\bdm\s+us\b|\b(?:send|shoot)\s+(?:me\s+)?a\s+dm\b|\bdm['’]?(?:den|e)\s+(?:yaz|ulas)|\bmesaj\s+at\b/u],
  [
    "book_call",
    /\b(?:book|schedule|apply)\b[^\n]{0,30}\b(?:call|session|consult|consultation|discovery)\b|\b(?:discovery|clarity|strategy)\s+call\b|\brandevu\b|\bgorusme\s+(?:ayarla|al)\b/u,
  ],
  [
    "link_in_bio",
    /\blink\s+in\s+(?:my\s+)?bio\b|\bbio\s+link\b|\blink\s+(?:is\s+)?in\s+(?:my\s+)?profile\b|\bbiyografi(?:deki|mdeki)\s+link|\bprofildeki\s+link/u,
  ],
  ["save_share", /\b(?:save|share|send)\s+(?:this|it)\b|\bsave\s+for\s+later\b|\bkaydet\b|\barkadasinla\s+paylas\b|\bpaylas\b/u],
  ["follow", /\bfollow\b(?:\s+(?:me|us|for))?|\btakip\s+et\b/u],
];

/** Açıklama yok/boş → "none" DEĞİL, `undefined` (CTA bilinmiyor: açıklaması olmayan video CTA'sız sayılmaz). */
export function classifyCta(caption: string | undefined): CtaType | undefined {
  if (caption === undefined || caption.trim() === "") return undefined;
  for (const match of caption.matchAll(COMMENT_KEYWORD)) if (!NOT_A_KEYWORD.has(match[1])) return "comment_keyword";
  const folded = foldTurkish(caption);
  for (const [type, pattern] of FOLDED_PATTERNS) if (pattern.test(folded)) return type;
  return "none";
}
