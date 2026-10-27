/**
 * Veri erişiminin TEK giriş noktası. Sayfalar/aksiyonlar yalnız buradan alır:
 *
 *   const { repo, wsId, now } = await getPanelContext();
 *   const competitors = await repo.listCompetitors(wsId);
 *
 * `now`: istekteki TEK saat. Tarih filtreleri ("son 30 gün"), yayın kotası penceresi ve geçmiş-zaman kontrolü
 * sayfa/aksiyon içinde `Date.now()`/`new Date()` ile ayrı ayrı okunmaz, buradan alınır: mock kaynakta sabit
 * `MOCK_NOW` (veri buna göre üretilir, "son 30 gün" verinin içine düşer), gerçek kaynakta `new Date()`.
 *
 * `DATA_SOURCE` env: `mock` (varsayılan) | `supabase`. `supabase`: Faz 1'de giriş ekranı yok — service role + yerel
 * kullanıcı (`LOCAL_USER_ID`, yayın onayı kaydı); env eksikse açık Türkçe hata. Geçerli çalışma alanı: OPERATÖR MODU açıksa
 * `sp_ws` çerezi (kayıtta varsa), değilse ya da geçersizse `LOCAL_WORKSPACE_ID` (bkz. `lib/workspace/operator-mode.ts`).
 * Mock/Supabase uygulamasını doğrudan import ETME — sınır grep'i: `@/lib/data/mock` src/app ve src/components'te 0.
 */
import { cache } from "react";

import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import type { MockOnboardingOptions } from "@/lib/data/mock/repos/context";
import { sharedMockRepository } from "@/lib/data/mock/mock-repository";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import { createSupabaseRepositoryFromEnv, readLocalSupabaseEnv } from "@/lib/data/supabase/from-env";
import { ONBOARDING_STEPS } from "@/lib/domain/onboarding";
import { PLATFORMS, type Platform } from "@/lib/domain/platform";
import { hasPlatformModule } from "@/lib/platforms/registry";
import { chooseWorkspaceId } from "@/lib/workspace/choose";
import { readWorkspaceCookie } from "@/lib/workspace/cookie";
import { getCurrentWorkspaceId } from "@/lib/workspace/current";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export type { PanelRepository } from "@/lib/data/repository";
export { RepositoryError } from "@/lib/data/repository";
export type * from "@/lib/data/queries";

export type DataSource = "mock" | "supabase";

export function getDataSource(): DataSource {
  const raw = (process.env.DATA_SOURCE ?? "mock").trim().toLowerCase();
  if (raw === "mock" || raw === "supabase") return raw;
  throw new RepositoryError("invalid_input", `Bilinmeyen DATA_SOURCE: "${raw}" (mock | supabase)`);
}

/** Örnek akışta iki ilerleme arası (ms): durum ucunun yoklama aralığından (4 sn) kısa, her yoklamada bir adım. */
const MOCK_ADVANCE_EVERY_MS = 3_000;

/**
 * Örnek (mock) kaynakta başlangıç akışının hangi adımdan başlayacağı: `MOCK_ONBOARDING=<adım>` (`ONBOARDING_STEPS`; ör. `add_account`). Verilirse
 * mock hesabı taze sayılır ve işler her okumada bir adım ilerler (mock'ta işçi yok); verilmezse / tanınmazsa akış kapalıdır (kurulu hesap).
 */
function mockOnboardingFromEnv(): MockOnboardingOptions {
  const raw = process.env.MOCK_ONBOARDING?.trim().toLowerCase();
  const start = ONBOARDING_STEPS.find((step) => step === raw);
  return start === undefined ? { autoAdvance: false } : { start, autoAdvance: true, pollAdvance: true, advanceEveryMs: MOCK_ADVANCE_EVERY_MS };
}

/**
 * Örnek (mock) kaynağın tek platformlu çeşidi: `MOCK_PLATFORM=<platform>` (ör. `tiktok`; modülü kayıtlı olmalı). Verilmezse / tanınmazsa
 * varsayılan örnek veri. `MOCK_ONBOARDING` ile birlikte çalışır (başlangıç akışı o platformun hesabıyla gezilir).
 */
function mockPlatformFromEnv(): Platform | undefined {
  const raw = process.env.MOCK_PLATFORM?.trim().toLowerCase();
  return PLATFORMS.find((platform) => platform === raw && hasPlatformModule(platform));
}

// Tek örnek: mock durumu (mutasyonlar) süreç boyunca `globalThis`'te (`sharedMockRepository`), Supabase istemcisi modül düzeyinde korunur.
let supabaseRepository: PanelRepository | undefined;

export function getRepository(): PanelRepository {
  if (getDataSource() === "supabase") {
    supabaseRepository ??= createSupabaseRepositoryFromEnv();
    return supabaseRepository;
  }
  return sharedMockRepository({ onboarding: mockOnboardingFromEnv(), platform: mockPlatformFromEnv() });
}

/**
 * Geçerli workspace: mock kaynakta sabit mock workspace. Supabase'de OPERATÖR MODU açıksa `sp_ws` çerezi (her istekte kayıtta var mı
 * doğrulanır; geçersiz/silinmiş/uydurma → varsayılan), kapalıysa (Vercel) yalnız `LOCAL_WORKSPACE_ID`.
 */
async function currentWorkspaceId(repo: PanelRepository): Promise<string> {
  if (getDataSource() !== "supabase") return getCurrentWorkspaceId();
  const operatorMode = isOperatorMode();
  return chooseWorkspaceId({
    defaultId: readLocalSupabaseEnv().workspaceId,
    operatorMode,
    cookieValue: operatorMode ? await readWorkspaceCookie() : undefined,
    exists: async (workspaceId) => (await repo.getWorkspace(workspaceId)) !== null,
  });
}

export interface PanelContext {
  repo: PanelRepository;
  wsId: string;
  /** İstek anı: mock kaynakta `MOCK_NOW`, gerçek kaynakta `new Date()`. Filtreler ve sunucu kodu yalnız bunu kullanır. */
  now: Date;
}

/**
 * Bir istekte (sayfa + düzen + alt bileşenler / aksiyon) TEK bağlam: depo + geçerli workspace kimliği + tek saat.
 * React `cache()` ile istek başına bir kez çözülür (workspace kimliği ve istek anı her çağrıda yeniden okunmaz; düzen,
 * sayfa ve alt bileşenler aynı `now`'ı görür). Önbellek istek ömürlüdür: istekler arası paylaşım yoktur.
 * Önbellekte yalnız değişmez parçalar (depo, kimlik, an) durur; `now` her çağrıya YENİ `Date` olarak verilir ki
 * çağıranın `setX` ile değiştirmesi aynı istekteki diğer kodu bozmasın.
 */
const resolvePanelContext = cache(async () => {
  const nowMs = (getDataSource() === "mock" ? new Date(MOCK_NOW) : new Date()).getTime();
  const repo = getRepository();
  return { repo, wsId: await currentWorkspaceId(repo), nowMs };
});

export async function getPanelContext(): Promise<PanelContext> {
  const { repo, wsId, nowMs } = await resolvePanelContext();
  return { repo, wsId, now: new Date(nowMs) };
}
