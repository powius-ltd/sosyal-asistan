import { Suspense, type ReactNode } from "react";

import { ChatDockSlot } from "@/components/chat/chat-dock-slot";
import { JobStatusSlot } from "@/components/jobs/job-status-slot";
import { CopyShell } from "@/components/shell/copy/copy-shell";
import { BottomTabs } from "@/components/shell/bottom-tabs";
import { SectionTabs } from "@/components/shell/section-tabs";
import { Topbar } from "@/components/shell/topbar";
import { readUnreadNotifications } from "@/components/shell/unread-count";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { maskotName } from "@/lib/agents/persona";
import { getDataSource, getPanelContext } from "@/lib/data";
import { isCopyEdition } from "@/lib/edition";
import { onboardingGate } from "@/lib/onboarding/gate";
import { isBackstageVisible } from "@/lib/workspace/backstage";
import { listOperatorWorkspaces } from "@/lib/workspace/registry";

// Panel verisi workspace/oturuma özeldir: derleme anında statik üretilmez, her istekte çalışır.
export const dynamic = "force-dynamic";

/**
 * Panel kabuğu: üst çubuk (marka + hesap seçici + ana gezinme [web] + tema + zil + profil menüsü) + iş durum şeridi + içerik alanı
 * (başında ikinci düzey sekmeler) + alt çubuk (telefon) + bildirimler (sonner) + sohbet: `lg`+ ekranda `main`in yanında sağ sabit sütun (varsayılan açık; kapatılınca sağ altta düğme), daha dar ekranda yalnız yüzen düğme. Kenar menü yoktur.
 * Sohbet yuvası `Suspense` içindedir: okuma yavaşlarsa sayfa beklemez, ortam uygun değilse hiç çizilmez.
 * Düğme akıştan çıkmıştır (`fixed`, alt gezinmenin üstünde): içeriğin son satırı onun altında kalmasın diye `main`'in alt dolgusu
 * geniştir. Bildirimler üst ortada çıkar (sağ alt sohbet düğmesinindir). İçerik ve üst çubuk aynı en çok genişlikte ortalanır.
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { repo, wsId } = await getPanelContext();
  if (isCopyEdition()) {
    // Müşteri kopyası: hesap geçişi yok; menünün üstünde yalnız hesabın kullanıcı adı (okunamazsa hesap adı) düz metin olarak durur.
    const [workspace, unreadNotifications, accounts] = await Promise.all([
      repo.getWorkspace(wsId),
      readUnreadNotifications(repo, wsId),
      repo.listOwnAccounts(wsId).catch(() => []),
    ]);
    const handle = accounts[0]?.handle;
    return (
      <CopyShell accountLabel={handle ? `@${handle}` : (workspace?.name ?? "Hesap")} unreadNotifications={unreadNotifications}>
        {children}
      </CopyShell>
    );
  }
  // Rozet süs bilgisidir: sayı okunamazsa panel çökmez, rozet gizlenir (undefined; "0" gösterilmez).
  // Hesap listesi de süstür: okunamazsa panel çökmez, seçici yalnız geçerli hesabı gösterir. `undefined` = geçiş kapalı (Vercel, mock veri).
  const [workspace, unreadNotifications, switchable] = await Promise.all([
    repo.getWorkspace(wsId),
    readUnreadNotifications(repo, wsId),
    listOperatorWorkspaces().catch(() => undefined),
  ]);
  const switchableAccounts = switchable?.map(({ id, name, accounts }) => ({ id, name, handle: accounts[0]?.handle }));
  // Geçerli hesabın kullanıcı adı: liste varsa oradan; yoksa (geçiş kapalı) tek hafif okuma. Okunamazsa yalnız ad gösterilir.
  const handle =
    switchableAccounts?.find((account) => account.id === wsId)?.handle ??
    (switchable === undefined ? (await repo.listOwnAccounts(wsId).catch(() => []))[0]?.handle : undefined);
  const isMockData = getDataSource() === "mock";
  // Kulis kapısı: derin ekranlar (sekmeler, Kulis menüsü) yalnız yönetici modunda; müşteri 4 ana ekranı görür.
  const backstage = isBackstageVisible();

  return (
    <TooltipProvider>
      {/* h-dvh: mobil tarayıcının açılıp kapanan adres çubuğunda yükseklik sıçramaz. */}
      <div className="flex h-dvh w-full flex-col overflow-hidden">
        <Topbar
          brand={maskotName()}
          account={{ id: wsId, name: workspace?.name ?? "Hesap yok", handle }}
          switchableAccounts={switchableAccounts}
          // "Hesap ekle" başlangıç akışının kapısını izler (örnek veride de açıktır); profil menüsüne eklenmez.
          canAddAccount={onboardingGate().open}
          // Kulis (İşler, Keşfet, Koleksiyonlar) yalnız yönetici modunda menüye girer; müşteri hiç görmez.
          operatorMode={backstage}
          isMockData={isMockData}
          unreadNotifications={unreadNotifications}
        />
        {/* İş durum şeridi: etkin iş varken her sayfada, üst çubuğun altında (etkin iş yoksa hiçbir şey çizmez). */}
        <JobStatusSlot />
        {/* Satır: sol sayfa (`main`), sağda `lg`+ sabit sohbet sütunu (ChatDockSlot; dar ekranda akışta yer kaplamaz). */}
        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pt-2 pb-24 md:px-6 md:pt-3">
            <div className="mx-auto w-full max-w-7xl">
              <SectionTabs operatorMode={backstage} copyEdition={isCopyEdition()} />
              {children}
            </div>
          </main>
          <Suspense fallback={null}>
            <ChatDockSlot />
          </Suspense>
        </div>
        <BottomTabs backstage={backstage} />
      </div>
      <Toaster position="top-center" mobileOffset={{ top: "calc(0.75rem + env(safe-area-inset-top))" }} />
    </TooltipProvider>
  );
}
