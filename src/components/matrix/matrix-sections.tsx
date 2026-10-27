import { MatrixNote } from "@/components/matrix/matrix-note";
import { CreativeMatrixSection } from "@/components/matrix/creative-matrix-section";
import { TopicHookMatrixSection } from "@/components/matrix/topic-hook-matrix-section";
import type { MatrixKind } from "@/lib/domain/account-type";
import type { CreativeMatrix } from "@/lib/domain/creative-matrix";
import type { TopicHookMatrix } from "@/lib/domain/topic-hook-matrix";
import type { MatrixCellRef } from "@/lib/matrix/cell-param";
import { ANGLE_MAP_PLAIN } from "@/lib/matrix/plain";
import type { TopicCellRef } from "@/lib/matrix/topic-cell-param";

export interface MatrixSectionsProps {
  /** Çizilecek matrisler, ekran sırasıyla (`matrixKindsOf(workspace.accountType)`); karma ikisini içerir. */
  kinds: readonly MatrixKind[];
  /** `getCreativeMatrix` sonucu: `angle_funnel` listedeyse verilir. */
  angle?: CreativeMatrix;
  /** `getTopicHookMatrix` sonucu: `topic_hook` listedeyse verilir. */
  topic?: TopicHookMatrix;
  /** `?hucre=` (açı hücresi) ve `?konu=` (konu hücresi) seçimi. */
  angleCell?: MatrixCellRef;
  topicCell?: TopicCellRef;
  /** Adreste ilgili parametre vardı (geçerli ya da değil): bulunamayan kutu tek cümleyle söylenir. */
  angleRequested?: boolean;
  topicRequested?: boolean;
  /** `?video=` (anatomi bölümünün video seçimi): hücre bağlantıları bunu korur. */
  video?: string;
  /** Yönetici modu: yaklaşım haritasında reklam işareti ve ayrıntısı. */
  operator?: boolean;
}

/** Hesap türünün harita bölümleri: liste sırasıyla çizilir; verisi verilmeyen tür atlanır. */
export function MatrixSections({ kinds, angle, topic, angleCell, topicCell, angleRequested = false, topicRequested = false, video, operator = false }: MatrixSectionsProps) {
  return (
    <>
      {/* Hesap türünde olmayan haritaya işaret eden adres sessizce yok sayılmaz. */}
      {angleRequested && !kinds.includes("angle_funnel") ? <MatrixNote>{ANGLE_MAP_PLAIN.missingAngle}</MatrixNote> : null}
      {topicRequested && !kinds.includes("topic_hook") ? <MatrixNote>{ANGLE_MAP_PLAIN.missingTopic}</MatrixNote> : null}
      {kinds.map((kind) => {
        if (kind === "angle_funnel") return angle ? <CreativeMatrixSection key={kind} matrix={angle} selected={angleCell} requested={angleRequested} video={video} operator={operator} /> : null;
        return topic ? <TopicHookMatrixSection key={kind} matrix={topic} selected={topicCell} requested={topicRequested} video={video} /> : null;
      })}
    </>
  );
}
