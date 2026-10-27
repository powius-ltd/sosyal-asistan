import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { complianceNote } from "@/components/competitors/add-config";
import { DiscoveryFilters } from "@/components/competitors/discovery-filters";
import { parseDiscoveryParams, toDiscoveryFilter } from "@/components/competitors/discovery-params";
import { DiscoveryTable } from "@/components/competitors/discovery-table";
import { buttonVariants } from "@/components/ui/button";
import { getPanelContext } from "@/lib/data";
import { ROUTES } from "@/lib/routes";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export const metadata: Metadata = { title: "Keşfet" };

export default async function DiscoverPage(props: PageProps<"/rakipler/kesfet">) {
  const state = parseDiscoveryParams(await props.searchParams);
  const { repo, wsId } = await getPanelContext();
  const operator = isOperatorMode();
  const [workspace, candidates] = await Promise.all([
    repo.getWorkspace(wsId),
    repo.listDiscoveryCandidates(wsId, toDiscoveryFilter(state)),
  ]);
  const filtered = state.source !== undefined || state.similarSizeOnly;

  return (
    <>
      <PageHeader
        title="Keşfet"
        description="İlgili hesaplardan ve aramadan bulunan rakip adayları; izlemeye al ya da yoksay."
        back={{ href: ROUTES.competitors, label: "Rakipler" }}
      />

      <DiscoveryFilters state={state} />

      {candidates.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={filtered ? "Bu filtrelere uyan aday yok" : "Şu an bekleyen aday yok"}
          description={
            filtered
              ? "Filtreleri gevşetmeyi dene."
              : "İzlediğin hesapların ilgili hesapları ve arama sonuçları toplandıkça adaylar burada listelenir."
          }
          action={
            filtered ? (
              <Link href={ROUTES.discover} className={buttonVariants({ variant: "outline" })}>
                Filtreleri temizle
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DiscoveryTable candidates={candidates} timeZone={workspace?.timezone} />
      )}

      <p className="mt-6 max-w-3xl text-xs text-muted-foreground">{complianceNote(operator)}</p>
    </>
  );
}
