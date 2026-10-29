/**
 * `PanelRepository` sözleşme süiti — her uygulama (mock, Faz 1'de Supabase) AYNI testleri geçmeli:
 * `runRepositoryContract("mock", () => createMockRepository(), { wsId })`. Belirli kayıt kimliği varsaymaz: kimlikleri
 * listelerden bulur, mutasyonda kendi kaydını oluşturur ve sonunda geri alır (yayın işi iptal, rakip `ignored`,
 * ayarlar/fikir durumu özgün değere). `wsId` ZORUNLUDUR: süit yalnız cron'suz, AYRI bir test workspace'inde koşulur
 * (bkz. `RepositoryContractOptions`); gerçek workspace'te koşturulmaz.
 * Seed gereksinimleri (ilk test açıkça doğrular): workspace (timezone dolu); resmi API'ye bağlı
 * (`connected`) ≥1 kendi hesap; hem kendi hem rakip içerik (≥3); ≥1 outlier (rakip, lift ≥ 3);
 * ≥1 keşif adayı (candidate, related/search); `published` dışında ≥1 fikir; ≥1 koşu; ≥1 koleksiyon; ≥1 bildirim; ≥1 `ok` + doğrulanmış analiz (hook kütüphanesi);
 * ≥1 haftalık plan (plana giren ≥1 fikir, her fikir ≥2 kanıtlı) ve ≥1 kendi hesap için ses profili; ≥1 izlenen (tracked) rakip (içgörüler);
 * konu eleği: `offNicheContentIds` seçeneğindeki içeriklerden ≥1'i pencere içi (90 gün), izlenen-rakip sahipli kısa video; pencere içi
 * `ok` + doğrulanmış analizli ≥1 kısa video (hook türü grupları);
 * fikir ↔ Reels bağı (`outcomes`): bağlanabilir (`dismissed` olmayan) ≥3 fikir (≥2'si `published` değil), ≥3 kısa kodlu kendi içerik ve
 * `suggestIdeaLink` kancası (otomatik öneri sunucu işidir); Kreatif Matris şekil sözleşmesi seed gerektirmez (etiketsiz workspace'te 20 boş hücre); Analist brifingi: seed'li workspace'te ≥ 1 brifing (≥ 1 eylemli `next_step`, içerik ref'leri seed içeriğine bağlı);
 * panel işleri: ≥ 1 BİTMİŞ iş (adımları yazılmış), ETKİN iş yok, `jobQueue` test kuyruğu ve `jobWorker` kancası (işi alan / bitiren işçidir);
 * kredi defteri: seed gerektirmez (her test kendi kredisini verir, farkla ölçer), `creditOps` kancası (veren / kesinleştiren sunucudur) ve depo
 * TEST kullanıcısının hesabıyla kurulur; iş ↔ kredi: `createEnforced` (kredi zorlaması açık depo; `create()` kapalı olanı verir). Henüz uygulanmamış özellikler `pending` ile bildirilir.
 *
 * Testler konuya göre `src/lib/data/contract/*.ts` parçalarındadır; burası yalnız birleştirir.
 */
import { describe } from "vitest";

import { adsContract } from "@/lib/data/contract/ads";
import { anatomyContract } from "@/lib/data/contract/anatomy";
import { basicsContract } from "@/lib/data/contract/basics";
import { bestTimesContract } from "@/lib/data/contract/best-times";
import { briefingContract } from "@/lib/data/contract/briefing";
import { collectionsContract } from "@/lib/data/contract/collections";
import { competitorsContract } from "@/lib/data/contract/competitors";
import { complianceContract } from "@/lib/data/contract/compliance";
import { contentContract } from "@/lib/data/contract/content";
import { creativeMatrixContract } from "@/lib/data/contract/creative-matrix";
import { creditsContract } from "@/lib/data/contract/credits";
import { hookLibraryContract } from "@/lib/data/contract/hook-library";
import { ideasPublishContract } from "@/lib/data/contract/ideas-publish";
import { insightsContract } from "@/lib/data/contract/insights";
import { insightsNicheContract } from "@/lib/data/contract/insights-niche";
import { jobCreditsContract } from "@/lib/data/contract/job-credits";
import { jobsContract } from "@/lib/data/contract/jobs";
import { manualIdeasContract } from "@/lib/data/contract/manual-ideas";
import { notificationsContract } from "@/lib/data/contract/notifications";
import { onboardingContract } from "@/lib/data/contract/onboarding";
import { opsContract } from "@/lib/data/contract/ops";
import { studioOrdersContract } from "@/lib/data/contract/studio-orders";
import { topicHookMatrixContract } from "@/lib/data/contract/topic-hook-matrix";
import { outcomesContract } from "@/lib/data/contract/outcomes";
import { createContractContext, type RepositoryContractOptions } from "@/lib/data/contract/support";
import { ideaRevisionContract } from "@/lib/data/contract/idea-revision";
import { planApprovalContract } from "@/lib/data/contract/plan-approval";
import { weeklyPlanContract } from "@/lib/data/contract/weekly-plan";
import { workspaceContract } from "@/lib/data/contract/workspace";
import { workspaceAccountTypeContract } from "@/lib/data/contract/workspace-account-type";
import { workspaceLanguageContract } from "@/lib/data/contract/workspace-language";
import type { PanelRepository } from "@/lib/data/repository";

export type { RepositoryContractOptions } from "@/lib/data/contract/support";

export function runRepositoryContract(name: string, create: () => PanelRepository, options: RepositoryContractOptions): void {
  const ctx = createContractContext(create, options);
  describe(`${name} · PanelRepository sözleşmesi`, () => {
    basicsContract(ctx);
    contentContract(ctx);
    competitorsContract(ctx);
    ideasPublishContract(ctx);
    manualIdeasContract(ctx);
    complianceContract(ctx);
    hookLibraryContract(ctx);
    collectionsContract(ctx);
    notificationsContract(ctx);
    opsContract(ctx);
    bestTimesContract(ctx);
    weeklyPlanContract(ctx);
    planApprovalContract(ctx);
    ideaRevisionContract(ctx);
    insightsContract(ctx);
    insightsNicheContract(ctx);
    outcomesContract(ctx);
    anatomyContract(ctx);
    creativeMatrixContract(ctx);
    topicHookMatrixContract(ctx);
    briefingContract(ctx);
    adsContract(ctx);
    jobsContract(ctx);
    creditsContract(ctx);
    jobCreditsContract(ctx);
    workspaceContract(ctx);
    workspaceLanguageContract(ctx);
    workspaceAccountTypeContract(ctx);
    onboardingContract(ctx);
    studioOrdersContract(ctx);
  });
}
