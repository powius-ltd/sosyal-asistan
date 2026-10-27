import type { Metadata } from "next";

import { AnatomyLinks, AnatomyView } from "@/components/anatomy/anatomy-view";
import type { AnatomySelection } from "@/components/anatomy/selected-video";
import { PageHeader } from "@/components/common/page-header";
import { ANATOMY_PAGE_TITLE, anatomyPageCopy } from "@/components/matrix/matrix-copy";
import { MatrixSections } from "@/components/matrix/matrix-sections";
import { ANATOMY_PLAIN } from "@/lib/anatomy/plain";
import { deriveVideoAnatomy } from "@/lib/anatomy/video";
import { getPanelContext } from "@/lib/data";
import { isOperatorMode } from "@/lib/workspace/operator-mode";
import { DEFAULT_ACCOUNT_TYPE, matrixKindsOf } from "@/lib/domain/account-type";
import { MATRIX_CELL_PARAM, parseMatrixCell } from "@/lib/matrix/cell-param";
import { parseTopicCell, TOPIC_CELL_PARAM } from "@/lib/matrix/topic-cell-param";
import { ANATOMY_VIDEO_PARAM } from "@/lib/routes";
import { first } from "@/lib/search-params";

export const metadata: Metadata = { title: ANATOMY_PAGE_TITLE };

/**
 * Kreatif anatomisi. EN ÜSTTE hesap türünün haritaları (`matrixKindsOf(workspace.accountType)`): işletme → yaklaşım haritası (açı × farkındalık,
 * `getCreativeMatrix`, `?hucre=<katman>:<aci>`), içerik üreticisi → konu ve açılış haritası (`getTopicHookMatrix`, `?konu=<küme>:<hook>`), karma →
 * ikisi alt alta. Altında anatomi: bir videonun faz zaman çizelgesi (Açılış · Giriş · Gövde · Çağrı) ve kendi ↔ rakip ↔ tutan karşılaştırması.
 * Adresten bir kutu ya da video seçilerek açılınca sayfa o panele kayar ve odak ona gelir.
 * Varsayılan video seçimi lift'i en yüksek analizli video; `?video=<contentId>` belirli videoyu açar. LLM'siz: toplu veri `getAnatomy`,
 * hook/CTA türü ve süre tabloları `getInsights` (Karşılaştırma ile aynı), tek video anatomisi `getContent` + `deriveVideoAnatomy`.
 */
export default async function AnatomyPage({ searchParams }: PageProps<"/anatomi">) {
  const params = await searchParams;
  const requested = first(params[ANATOMY_VIDEO_PARAM]);
  // Adreste kutu parametresi var mı (geçerli ya da değil): bulunamayan kutu tek cümleyle söylenir, sessizce yok sayılmaz.
  const angleRaw = first(params[MATRIX_CELL_PARAM]);
  const topicRaw = first(params[TOPIC_CELL_PARAM]);
  const angleCell = parseMatrixCell(angleRaw);
  const topicCell = parseTopicCell(topicRaw);
  const { repo, wsId, now } = await getPanelContext();
  const workspace = await repo.getWorkspace(wsId);
  const kinds = matrixKindsOf(workspace?.accountType ?? DEFAULT_ACCOUNT_TYPE);
  const [angle, topic, report, insights] = await Promise.all([
    kinds.includes("angle_funnel") ? repo.getCreativeMatrix(wsId) : undefined,
    kinds.includes("topic_hook") ? repo.getTopicHookMatrix(wsId) : undefined,
    repo.getAnatomy(wsId),
    repo.getInsights(wsId),
  ]);

  const contentId = requested ?? report.videos[0]?.contentItemId;
  let selection: AnatomySelection | undefined;
  if (contentId !== undefined) {
    const detail = await repo.getContent(wsId, contentId);
    const anatomy =
      detail?.analysis === undefined ? undefined : deriveVideoAnatomy({ item: detail.item, analysis: detail.analysis, transcript: detail.transcript, now });
    if (detail === null) selection = { kind: "not_found", contentId };
    else if (anatomy === undefined || detail.analysis === undefined) selection = { kind: "no_analysis", contentId };
    else selection = { kind: "ok", contentId, anatomy, evidenceVerified: detail.analysis.evidenceVerified };
  }

  const copy = anatomyPageCopy(kinds);
  return (
    <>
      <PageHeader title={copy.title} description={copy.description} actions={<AnatomyLinks />} />
      <div className="flex flex-col gap-10">
        <MatrixSections
          kinds={kinds}
          angle={angle}
          topic={topic}
          angleCell={angleCell}
          topicCell={topicCell}
          angleRequested={angleRaw !== undefined}
          topicRequested={topicRaw !== undefined}
          video={requested}
          operator={isOperatorMode()}
        />
        <section aria-labelledby="anatomy-title" className="flex flex-col gap-4">
          <h2 id="anatomy-title" className="text-lg font-semibold tracking-tight">
            {ANATOMY_PLAIN.title}
          </h2>
          {/* Bir kutu seçiliyken sayfa o kutunun ayrıntısına kayar; yalnız `?video=` varsa seçili videoya. */}
          <AnatomyView report={report} insights={insights} selection={selection} scrollToVideo={requested !== undefined && angleCell === undefined && topicCell === undefined} />
        </section>
      </div>
    </>
  );
}
