/**
 * Başlangıç akışının istek başına TEK okuması: `/baslangic` sayfası ve Bugün (`today/today-data.ts`; panel düzenindeki sohbet düğmesi de
 * onu okur) aynı sonucu paylaşır (React `cache()`). Örnek veride her `getOnboardingState` okuması işi bir adım ilerlettiği için
 * (`MOCK_ONBOARDING`) okuma bilerek tek yerdedir: aynı istekte iki kez okunmaz.
 */
import "server-only";

import { cache } from "react";

import { getPanelContext } from "@/lib/data";
import type { OnboardingState } from "@/lib/domain/onboarding";

export const loadOnboardingState = cache(async (): Promise<OnboardingState> => {
  const { repo, wsId } = await getPanelContext();
  return repo.getOnboardingState(wsId);
});
