/**
 * Karar kuyruğu: "Bugün" ekranında sırayla tüketilen kartlar. Saf fonksiyon (LLM yok, `Date.now()` yok). Öncelik Genel bakışın
 * "senden beklediğim" sırasını izler (`buildAsks`): başlangıç akışı (açıksa en başta; ilk kurulum kartlarının yerine) · hesabı bağla · ilk kurulum · yayın onayı · eşleşme önerisi · paylaşılan videonun
 * bağlantısı · sıradaki çekim · ölçüm bütçesi · benzer hesap önerileri (akış açıkken yok) · haftalık tur (iş başlatır; önce kararlar verilsin diye sonda).
 * Para/sağlayıcı/iş konuşan kart (`operatorOnly`) müşteri modunda üretilmez.
 */
import { buildOverviewSummary } from "@/lib/overview/summary";
import {
  approvePublishCards,
  confirmLinkCards,
  connectAccountCards,
  measurementBudgetCards,
  onboardingCards,
  pasteReelLinkCards,
  reviewRivalsCards,
  runRoutineCards,
  setupAccountTypeCards,
  setupNicheCards,
  shootNextCards,
} from "@/lib/today/decision-cards";
import type { DecisionCard, TodayInput } from "@/lib/today/types";

export function buildDecisionQueue(input: TodayInput): DecisionCard[] {
  const empty = buildOverviewSummary(input.summary).empty;
  const paste = pasteReelLinkCards(input);
  const asked = new Set(paste.map((card) => card.id.slice("paste_reel_link:".length)));
  // Aynı fikir için hem "paylaştın mı?" hem "sıradaki çekim" sorulmaz: günü geçen madde için bağlantı sorusu öncelikli.
  const shoot = shootNextCards(input).filter((card) => !asked.has(card.id.slice("shoot_next:".length)));

  // Akış açıkken hesap, konu ve tür sorularını akış sorar: aynı soru iki yerden sorulmaz.
  const flow = onboardingCards(input);
  const setup = flow.length > 0 ? [] : [...connectAccountCards(input), ...setupNicheCards(input, empty), ...setupAccountTypeCards(input, empty)];

  const cards = [
    ...flow,
    ...setup,
    ...approvePublishCards(input),
    ...confirmLinkCards(input),
    ...paste,
    ...shoot,
    ...measurementBudgetCards(input),
    // Akış açıkken benzer hesapları akış sorar (seçim ekranı); aynı soru iki yerden sorulmaz.
    ...(flow.length > 0 ? [] : reviewRivalsCards(input)),
    ...runRoutineCards(input, empty),
  ];
  return cards.filter((card) => input.summary.operator || !card.operatorOnly);
}
