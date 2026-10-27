import { GitCompareArrows } from "lucide-react";
import type { Metadata } from "next";

import { ComparisonView } from "@/components/comparison/comparison-view";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { getPanelContext } from "@/lib/data";
import { COMPARISON_PLAIN } from "@/lib/plain-language-results";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: COMPARISON_PLAIN.title };

/**
 * Karşılaştırma — kendi hesap ↔ rakipler. LLM'siz: `getInsights` mevcut veriden hesaplar, veri toplanır toplanmaz dolar.
 * Ölçülemeyen bölümler sebebiyle görünür (`Insights.unmeasured`).
 */
export default async function ComparisonPage() {
  const { repo, wsId } = await getPanelContext();
  const insights = await repo.getInsights(wsId);

  return (
    <>
      <PageHeader
        title={COMPARISON_PLAIN.title}
        description={COMPARISON_PLAIN.description}
        back={{ href: ROUTES.competitors, label: "Rakipler" }}
      />
      {insights.rows.length === 0 ? (
        <EmptyState
          icon={GitCompareArrows}
          title={COMPARISON_PLAIN.empty.title}
          description={COMPARISON_PLAIN.empty.body}
        />
      ) : (
        <ComparisonView insights={insights} />
      )}
    </>
  );
}
