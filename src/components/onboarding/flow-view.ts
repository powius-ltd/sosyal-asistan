/**
 * Akış durumundan EKRAN seçimi (saf): adım veriden türer (`deriveOnboarding`), burada yalnız "hangi ekran çizilecek, yol şeridinde
 * neredeyiz, Demirkazık ne yapıyor" sorusu yanıtlanır. Ekran adımın birebir kopyası değildir: "başka hesap ekle" niyeti ekleme formunu
 * açar; ilk incelemesi başlamadan duran akış (`blocked` + `start_build`) seçim ekranına geri döner (neden üstte yazılır).
 */
import type { OnboardingState } from "@/lib/domain/onboarding";
import type { OnboardingPhase } from "@/lib/domain/onboarding-job";
import type { MascotState } from "@/lib/mascot/state";
import { ONBOARDING_REASON_PLAIN, ONBOARDING_STEP_PLAIN } from "@/lib/plain-language-onboarding";

export const ONBOARDING_SCREENS = ["add", "probing", "review", "rivals", "building", "done", "blocked"] as const;
export type OnboardingScreen = (typeof ONBOARDING_SCREENS)[number];

type FlowStatus = Pick<OnboardingState, "step" | "next">;

export function onboardingScreenOf(state: FlowStatus, wantsAdd: boolean): OnboardingScreen {
  if (wantsAdd) return "add";
  switch (state.step) {
    case "add_account":
      return "add";
    case "probing":
      return "probing";
    case "review_account":
      return "review";
    case "choose_rivals":
      return "rivals";
    case "building":
      return "building";
    case "done":
      return "done";
    case "blocked":
      return state.next === "start_build" ? "rivals" : "blocked";
  }
}

/** Yol şeridindeki durak sayısı (`ONBOARDING_ROUTE_PLAIN.stops` ile aynı; testle eşit tutulur). */
export const ONBOARDING_ROUTE_LENGTH = 5;

/**
 * Yol şeridindeki yer: `current` 1'den başlar; `complete` = bütün duraklar geçildi (akış kapandı). Duran akışta durak, çıkış yolunun ait
 * olduğu duraktır (yeniden bakış → 2, sürdür → 5, başka hesap → 1).
 */
export function onboardingRoutePosition(screen: OnboardingScreen, state: FlowStatus): { current: number; complete: boolean } {
  switch (screen) {
    case "add":
      return { current: 1, complete: false };
    case "probing":
      return { current: 2, complete: false };
    case "review":
      return { current: 3, complete: false };
    case "rivals":
      return { current: 4, complete: false };
    case "building":
      return { current: 5, complete: false };
    case "done":
      return { current: ONBOARDING_ROUTE_LENGTH, complete: true };
    case "blocked":
      return { current: state.next === "resume" ? 5 : state.next === "start_probe" ? 2 : 1, complete: false };
  }
}

/** Başlıktaki Demirkazık: bakarken düşünüyor, sonucu / soruyu söylerken anlatıyor ("sıra sende" sarısı karar bloğundadır). */
export function onboardingMascotState(screen: OnboardingScreen): MascotState {
  return screen === "probing" || screen === "building" ? "thinking" : "telling";
}

/** İlerleme ekranının aşaması. */
export function onboardingPhaseOfScreen(screen: "probing" | "building"): OnboardingPhase {
  return screen === "probing" ? "probe" : "build";
}

/** Ekranın başlığı, alt cümlesi ve (varsa) uyarısı: hepsi sözlükten, ekran + nedenden. Duran akışta neden alt cümledir. */
export function onboardingHeadingOf(screen: OnboardingScreen, state: Pick<OnboardingState, "reason">): { title: string; lead: string; notice?: string } {
  const reason = state.reason === undefined ? undefined : ONBOARDING_REASON_PLAIN[state.reason];
  switch (screen) {
    case "add":
      return ONBOARDING_STEP_PLAIN.add_account;
    case "probing":
      return ONBOARDING_STEP_PLAIN.probing;
    case "building":
      return ONBOARDING_STEP_PLAIN.building;
    case "review":
      // Az video uyarısı: akış sürer, sonuçların kaba olacağı baştan söylenir.
      return { ...ONBOARDING_STEP_PLAIN.review_account, ...(reason === undefined ? {} : { notice: reason }) };
    case "rivals":
      // Öneri bulunamadı / az video / ilk inceleme başlayamadı (duran akış seçim ekranına döndü): neden uyarı olarak yazılır.
      return { ...ONBOARDING_STEP_PLAIN.choose_rivals, ...(reason === undefined ? {} : { notice: reason }) };
    case "blocked":
      return { title: ONBOARDING_STEP_PLAIN.blocked.title, lead: reason ?? ONBOARDING_STEP_PLAIN.blocked.lead };
    case "done":
      // Plan çıkmadıysa / hesap zaten kuruluysa "ilk planın hazır" DENMEZ: başlık nedenin kendisidir.
      return state.reason === "plan_ready" || reason === undefined ? ONBOARDING_STEP_PLAIN.done : { title: reason, lead: "" };
  }
}
