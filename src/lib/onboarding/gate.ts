/**
 * Başlangıç akışı kapısı — TEK yerde: hesap ekleyen, bakışı / ilk turu başlatan, hesabı onaylayan her action bunu ister. Bugün üyelik yok:
 * akış "üye olmuş tek kullanıcı" varsayımıyla kurulur ve kapı yerel kullanıcıyı (yönetici modu) tanır. ÜYELİK GELİNCE YALNIZ BURASI DEĞİŞİR
 * (`isOperatorMode` → oturum üyeliği + paket başına hesap sınırı); action'lar ve ekranlar kapının sonucunu kullanır, kuralı yeniden yazmaz.
 *
 * Açık = yönetici modu açık VE (örnek veri kaynağı YA DA işler bu ortamda başlatılabiliyor). Örnek (mock) veride işçi yoktur: akış mock
 * deposunda ilerler (ekranlar gezilebilsin diye), para harcanmaz. Gerçek veride iş kuyruğunun koşulları aranır (`jobsAvailability`).
 * Sınır: bu klasör panel sürecinde çalışır ve `lib/job-runner`'ı (işçi) içe aktarmaz.
 */
import "server-only";

import { jobsAvailability, type JobsAvailabilityDeps, type JobsUnavailableReason } from "@/lib/job-control/availability";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export type OnboardingGateClosedReason = "operator_off" | JobsUnavailableReason;

export type OnboardingGate = { open: true; /** Örnek veri: iş koşturulmaz, akış mock deposunda ilerler. */ mock: boolean } | { open: false; reason: OnboardingGateClosedReason };

/** Kapı kapalıyken söylenen neden (düz dil; sağlayıcı adı, komut yok). */
export const ONBOARDING_GATE_MESSAGE: Record<OnboardingGateClosedReason, string> = {
  operator_off: "Hesap ekleme bu ortamda kapalı.",
  hosted: "Bu ortamda hesap eklenemiyor.",
  data_source: "Bu veri kaynağında hesap eklenemiyor.",
  worker_missing: "Hesaba bakacak program bulunamadı; hesap eklenemiyor.",
  not_ready: "Hesap ekleme henüz kullanılamıyor.",
};

export function onboardingGate(deps: JobsAvailabilityDeps = {}): OnboardingGate {
  const env = deps.env ?? process.env;
  if (!isOperatorMode(env)) return { open: false, reason: "operator_off" };
  // `getDataSource()` ile aynı okuma: boş = örnek veri.
  if ((env.DATA_SOURCE ?? "mock").trim().toLowerCase() === "mock") return { open: true, mock: true };
  const availability = jobsAvailability(deps);
  return availability.available ? { open: true, mock: false } : { open: false, reason: availability.reason };
}
