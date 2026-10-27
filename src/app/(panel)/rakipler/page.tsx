import { Compass, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { AddCompetitorDialog } from "@/components/competitors/add-competitor-dialog";
import { complianceNote } from "@/components/competitors/add-config";
import { CompetitorsTable } from "@/components/competitors/competitors-table";
import { TAP_TARGET } from "@/components/notifications/tap";
import { buttonVariants } from "@/components/ui/button";
import { getPanelContext } from "@/lib/data";
import { ROUTES } from "@/lib/routes";
import { isOperatorMode } from "@/lib/workspace/operator-mode";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rakipler" };

export default async function CompetitorsPage() {
  const { repo, wsId } = await getPanelContext();
  const operator = isOperatorMode();
  const [workspace, watched, ignored, candidates, ownAccounts] = await Promise.all([
    repo.getWorkspace(wsId),
    repo.listCompetitors(wsId, { status: ["tracked", "private", "not_found"] }),
    repo.listCompetitors(wsId, { status: "ignored" }),
    repo.listCompetitors(wsId, { status: "candidate" }),
    repo.listOwnAccounts(wsId),
  ]);
  // Rakip, kendi hesapla aynı platformdan olur: ekleme penceresi o platformla açılır.
  const ownPlatform = ownAccounts[0]?.platform;
  const timeZone = workspace?.timezone;

  return (
    <>
      <PageHeader
        title="Rakipler"
        description="Takip ettiğin rakip hesaplar: paylaşım sıklığı, izlenme düzeyi ve kaç içeriğinin tuttuğu."
        actions={
          <>
            <Link href={ROUTES.discover} className={cn(buttonVariants({ variant: "outline" }), TAP_TARGET)}>
              <Compass aria-hidden />
              Keşfet{candidates.length > 0 ? ` (${candidates.length})` : ""}
            </Link>
            <AddCompetitorDialog defaultPlatform={ownPlatform} operator={operator} ownAccounts={ownAccounts} />
          </>
        }
      />

      {watched.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Henüz izlenen rakip yok"
          description="Bir rakip ekle ya da Keşfet'teki adaylardan birini izlemeye al; veri toplandıkça bu tablo dolar."
          action={<AddCompetitorDialog defaultPlatform={ownPlatform} operator={operator} ownAccounts={ownAccounts} />}
        />
      ) : (
        <CompetitorsTable competitors={watched} timeZone={timeZone} />
      )}

      {ignored.length > 0 ? (
        <details className="mt-8 rounded-xl border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Yoksayılan hesaplar ({ignored.length})
          </summary>
          <div className="border-t px-2 pb-2">
            <CompetitorsTable competitors={ignored} timeZone={timeZone} />
          </div>
        </details>
      ) : null}

      <p className="mt-6 max-w-3xl text-xs text-muted-foreground">{complianceNote(operator)}</p>
    </>
  );
}
