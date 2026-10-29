/**
 * Revize reddinin Türkçe hata metni (depo `invalid_state` iletisi; mock ve Supabase aynısını kullanır). Müşteri cümleleri ekran sözlüğündedir
 * (`plain-language-order.ts`); bu metinler yalnız eylemin hata kutusuna düşer.
 */
import type { OrderRevisionProblem } from "@/lib/domain/studio-order";

export const REVISION_PROBLEM_MESSAGE: Record<OrderRevisionProblem, string> = {
  not_produced: "Bu video henüz üretilmedi ya da onay aşamasını geçti; revize istenemez.",
  limit: "Bu videoya en fazla 3 revize istenebilir; yeni bir fiş yazmak gerekir.",
  no_pending_publish: "Bu video artık onay beklemiyor (onaylanmış, planlanmış ya da paylaşılmış); revize istenemez.",
};
