/**
 * Senaryo zanaatı istem blokları (hook, izletme yapısı, konuşma Türkçesi): fikir üretimi (`generate-ideas.ts`) ve editör turu
 * (`script-review.ts`) AYNI kuralları kullanır. Kaynak: kullanıcının `~/.claude/agents/{instagram-reels,senaryo-yazari,content-quality-editor}.md`
 * tanımları (salt okunur), istem için yoğunlaştırılmış İngilizce kural olarak yazıldı. Claude CLI `--safe-mode` ile koşar (skill kapalı):
 * bilgi bu bloklarla verilir. Kural ya da anlam değişince `CRAFT_BLOCKS_VERSION` artar (istem sürümleri onu izler).
 * Bloklar PERSONAL FACTS RULE, NO_STRAY_NUMBERS ve kanıt alıntısı kurallarını DEĞİŞTİRMEZ: yalnız biçim ve üslup kuralıdır.
 */
import type { ContentLanguage } from "@/lib/domain/content-language";

export const CRAFT_BLOCKS_VERSION = "craft-v1";

/** Açılış (hook) zanaatı: ilk satır ve ilk kare. */
export const HOOK_CRAFT_RULE =
  "HOOK CRAFT: the hook is the first line AND the first frame; it must stop the scroll within three seconds. Build each hook on ONE concrete device: a bold result, a mistake the viewer is probably making, a surprising contrast, or a direct question aimed at a specific person in a specific situation. " +
  "The hooks of one idea must differ in approach, not in wording. Open with the viewer's situation or the payoff, never with greetings, self-introductions or throat-clearing ('Hi, in this video...', 'Merhaba arkadaşlar...'). " +
  "Make the hook speakable in one breath, with no filler. Never promise a result, testimonial or number that the evidence does not support.";

/** İzletme yapısı: sona kadar tutan akış. */
export const RETENTION_RULE =
  "RETENTION STRUCTURE: one idea per video (if it needs 'and also', it is two videos). Order: hook, then the payoff promised early (say what the viewer will get), then the steps or story in short beats, then the payoff delivered, then ONE soft call-to-action. " +
  "Open a small curiosity gap early and close it only near the end. Every beat is a single thought that ends in a natural bridge to the next one, and the script re-hooks (a turn, a contrast, a question) roughly every ten to fifteen seconds so there is no flat stretch. " +
  "Size the script to targetDurationSec at spoken pace (about 130-150 words per minute) and cut anything that does not serve the one idea. " +
  "Write for silent viewing too: the outline names the on-screen text for each beat (short, large, one line at a time). Keep fast-aging facts (prices, versions, limits) out of the main script.";

/** Konuşma Türkçesi (yalnız içerik dili `tr`): yazı dili değil, kameraya söylenen dil. */
export const SPOKEN_TURKISH_RULE =
  "SPOKEN TURKISH: the script is said out loud to a camera, so write the way a real person talks: short sentences, everyday words, the creator's own sen/siz form held consistently, contractions of speech where natural. " +
  "Avoid written-language stiffness ('-mektedir', 'söz konusu', 'bu bağlamda', 'yapılmaktadır', long passive chains), translation-ese (English word order, calques such as 'gün sonunda' or 'masaya getirmek', chains of '...olarak') and machine-sounding filler (empty openers and closers, 'devrim niteliğinde', 'kapsamlı bir rehber', 'yolculuk', formulaic triplets and 'X değil, Y' contrasts used as a tic). " +
  "Keep full Turkish diacritics (ı İ ğ ş ç ö ü) and correct de/da, ki, mi spelling. Technical terms stay in their original form.";

/** İçerik diline göre zanaat blokları (konuşma Türkçesi yalnız `tr`). */
export function craftBlocks(language: ContentLanguage): string[] {
  return [HOOK_CRAFT_RULE, RETENTION_RULE, ...(language === "tr" ? [SPOKEN_TURKISH_RULE] : [])];
}
