import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { IdeaCard } from "@/components/ideas/idea-card";
import { IdeasTabs, type IdeasTab } from "@/components/ideas/ideas-tabs";
import { IDEA_STATUS_EMPTY, IDEA_STATUS_LABEL } from "@/components/ideas/status-labels";
import { loadActiveOrderIds } from "@/components/studio-order/order-map";
import { readOptional } from "@/components/weekly-plan/optional-read";
import { JobCommand } from "@/components/workspace/job-command";
import { getPanelContext } from "@/lib/data";
import { IDEA_STATUSES } from "@/lib/domain/intel";
import type { IdeaLink } from "@/lib/domain/outcomes";
import { formatNumber } from "@/lib/format";
import { IDEA_PLAIN } from "@/lib/plain-language-plan";
import { first } from "@/lib/search-params";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export const metadata: Metadata = { title: "Fikirler" };

/** Her sekmede gösterilen en çok fikir; sekme sayısı bundan bağımsızdır (`countIdeasByStatus`). */
const IDEAS_PER_TAB = 50;

/**
 * Next 16: `searchParams` bir Promise'tir. `?id=<fikir>`: o fikrin sekmesi açılır, kart vurgulanır, ekrana kaydırılır ve senaryo bölümü açık gelir;
 * bulunamayan kimlikte kısa bir bilgi yazılır (liste yine gösterilir).
 * Sekme sayıları `countIdeasByStatus`'tan, kartlar durum başına `listIdeas`'tan gelir; kanıt bilgisi fikrin
 * kendi kanıt özetindedir (kanıt başına içerik okunmaz). Bekleyen Reels eşleşme önerileri TEK sorguyla gelir (`listIdeaLinks`) ve
 * fikre göre gruplanır; depo bağı henüz desteklemiyorsa öneri bölümü boş kalır, sayfa çalışır. Hiç fikir yokken planı hazırlayan iş
 * düğmesi çizilir (`JobCommand`: yalnız işler panelden başlatılabiliyorken; müşteri görünümünde ne düğme ne komut).
 */
export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const { id: rawId } = await searchParams;
  const focusId = first(rawId);

  const { repo, wsId } = await getPanelContext();
  const [counts, lists, focused, suggested] = await Promise.all([
    repo.countIdeasByStatus(wsId),
    Promise.all(IDEA_STATUSES.map((status) => repo.listIdeas(wsId, { status, limit: IDEAS_PER_TAB }))),
    focusId ? repo.getIdea(wsId, focusId) : null,
    readOptional(() => repo.listIdeaLinks(wsId, { status: "suggested" })),
  ]);
  const suggestionsByIdea = new Map<string, IdeaLink[]>();
  for (const link of suggested.value ?? []) suggestionsByIdea.set(link.ideaId, [...(suggestionsByIdea.get(link.ideaId) ?? []), link]);
  const byStatus = new Map(IDEA_STATUSES.map((status, i) => [status, lists[i]]));
  // Odaklanan fikir sekmesinin ilk sayfasında değilse başa eklenir: `?id=` ile gelinen kart hep görünür.
  const focusedList = focused ? byStatus.get(focused.status) : undefined;
  if (focused && focusedList && !focusedList.some((idea) => idea.id === focused.id)) focusedList.unshift(focused);
  // Kartların fişi: tüm sekmelerdeki fikirler için TEK okuma (odaklanan kart da listede).
  const orderIdByIdea = await loadActiveOrderIds(repo, wsId, [...new Set(lists.flat().map((idea) => idea.id))]);

  // Yönetici görünümü sunucuda karar verilir: öncelik puanı ve "Prompt olarak kopyala" müşteri görünümünde yoktur.
  const operator = isOperatorMode();
  const focusMissing = focusId !== undefined && focused === null;
  const total = IDEA_STATUSES.reduce((sum, status) => sum + counts[status], 0);

  const tabs: IdeasTab[] = IDEA_STATUSES.map((status) => {
    // Hesap sahibinin kendi fikirleri (sıralama puanı 0) en üstte: sıralı listede sona düşüp kesilmesin.
    const all = byStatus.get(status) ?? [];
    const list = [...all.filter((idea) => idea.source === "manual"), ...all.filter((idea) => idea.source !== "manual")];
    return {
      value: status,
      label: IDEA_STATUS_LABEL[status],
      count: counts[status],
      content:
        list.length === 0 ? (
          <EmptyState icon={Lightbulb} {...IDEA_STATUS_EMPTY[status]} />
        ) : (
          <div className="flex flex-col gap-3">
            {counts[status] > list.length ? (
              <p className="text-xs text-muted-foreground">
                {formatNumber(counts[status])} fikirden en yüksek sıralı {formatNumber(list.length)} tanesi gösteriliyor.
              </p>
            ) : null}
            <div className="grid gap-4 xl:grid-cols-2">
              {list.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} highlighted={idea.id === focused?.id} suggestions={suggestionsByIdea.get(idea.id)} operator={operator} orderId={orderIdByIdea[idea.id]} />
              ))}
            </div>
          </div>
        ),
    };
  });

  return (
    <>
      <PageHeader
        title="Fikirler"
        description="Tutan içeriklerden çıkarılan “bunu çek” kartları: dayandığı videolar, açılış cümlesi önerileri, rakip alıntıları, senaryo ve açıklama taslağı."
      />
      {focusMissing ? (
        <p role="status" className="mb-4 rounded-lg border border-notice-border bg-notice px-4 py-2 text-sm text-notice-foreground">
          <strong>{IDEA_PLAIN.notFound}</strong> {IDEA_PLAIN.notFoundHint}
        </p>
      ) : null}
      {total === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Henüz fikir yok"
          description="Fikir kartları, haftalık plan hazırlanırken tutan içeriklerden çıkarılır. Üretildikçe burada durumlarına göre listelenir."
          action={<JobCommand request={{ kind: "plan" }} className="items-center" />}
        />
      ) : (
        <IdeasTabs tabs={tabs} defaultValue={focused?.status ?? "new"} />
      )}
    </>
  );
}
