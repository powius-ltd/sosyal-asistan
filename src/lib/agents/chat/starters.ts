/**
 * Hazır sorular (SAF; LLM yok): boş sohbette düğme olarak gösterilir. Yalnız CEVABI OLAN sorular önerilir (D3-11): her soru, olgu paketinde
 * karşılığı bulunan bir sinyale bağlıdır (`StarterSignals`, `starter-signals.ts`); önerilen ilk soru "söyleyemiyorum" derse sohbete güven kırılır.
 * Hesap türü ADIYLA dallanılmaz: `accountTypeProfile` alanları (`matrices`, `contentMix`) ve rakip var mı (`hasRivals`) seçer
 * (`docs/GENEL-BAKIS-TASARIM.md` §5):
 *  - işletme/koç (yalnız satış): bu hafta · rakiplerde tutan, bende eksik (rakip izleniyorsa) · son video · en iyi video · plan dayanağı;
 *  - içerik üreticisi (yalnız erişim): bu hafta · hangi konular · hangi açılış · son video · en iyi video;
 *  - karma (erişim + satış): bu hafta · erişim mi satış mı · hangi konular · son video · en iyi video.
 * En çok 4 soru; sıra öncelik sırasıdır (sığmayan sondakiler düşer). Satışsız hesapta satış/müşteri sorusu çıkmaz. "Son videom" yalnız yayın tarihi
 * bilinen kendi video varken önerilir (paketteki `latest` olgu); "en iyi videom" yalnız son 90 günde tutan video varken.
 */
import { accountTypeProfile, DEFAULT_ACCOUNT_TYPE, type AccountType } from "@/lib/domain/account-type";
import type { StarterSignals } from "@/lib/agents/chat/starter-signals";

export const CHAT_STARTERS_MAX = 4;

export interface StarterInput {
  accountType?: AccountType;
  /** Rakip izleniyor mu (rakip sorusu yalnız o zaman anlamlı). */
  hasRivals: boolean;
  /** Hangi sorunun cevabı var; okunamadıysa hiç soru önerilmez (boş cevaplı soru önermektense). */
  signals: StarterSignals;
}

/** Hazır soruları üretir; sıra öncelik sırasıdır, en çok `CHAT_STARTERS_MAX`. */
export function chatStarters({ accountType = DEFAULT_ACCOUNT_TYPE, hasRivals, signals }: StarterInput): string[] {
  const { matrices, contentMix } = accountTypeProfile(accountType);
  const sells = contentMix.sales > 0;
  const reaches = contentMix.reach > 0;
  const topics = matrices.includes("topic_hook") && signals.hasTopicWinners;
  const questions: (string | false)[] = [
    signals.hasPlan && "Bu hafta ne çekmeliyim?",
    sells && !reaches && hasRivals && signals.hasAngleOpportunity && "Rakiplerde tutan, bende eksik olan ne?",
    sells && reaches && signals.hasPlan && "Erişim mi satış mı, hangisi daha iyi gidiyor?",
    topics && "Hangi konularım tutuyor?",
    !sells && reaches && topics && "Hangi açılış bende işe yarıyor?",
    signals.hasLatest && "Son videom nasıl gitti?",
    signals.hasOwnBest && "En iyi videom nasıl gitti?",
    sells && !reaches && signals.hasPlan && "Bu plan neye dayanıyor?",
  ];
  return questions.filter((question): question is string => question !== false).slice(0, CHAT_STARTERS_MAX);
}
