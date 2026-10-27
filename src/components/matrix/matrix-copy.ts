/**
 * Harita türüne göre ekran metinleri (saf). Hangi haritaların çizileceği hesap türünden gelir (`matrixKindsOf`, `lib/domain/account-type`);
 * burada yalnız o listenin başlık/açıklama karşılığı vardır: sayfa türe göre dallanmaz, listeyi okur.
 */
import type { MatrixKind } from "@/lib/domain/account-type";
import type { JobKind } from "@/lib/domain/panel-job";
import { MAP_DESCRIPTION_PLAIN, MAP_KIND_PLAIN } from "@/lib/matrix/plain";

/**
 * Matrisi DOLDURAN iş (boş durumun düğmesi): açı × farkındalık matrisi açı etiketlemesiyle dolar, konu kümeleri plan hazırlanırken
 * oluşur. Hangi matrisin çizildiği hesap türünden geldiği için (`matrixKindsOf`) düğme de türü izler: açı etiketlemesi uygulamayan türde
 * açı matrisi ve "Açıları etiketle" hiç çizilmez; ekran türle elle dallanmaz.
 */
export const MATRIX_FILL_JOB = { angle_funnel: "label", topic_hook: "plan" } as const satisfies Record<MatrixKind, JobKind>;

/** Haritanın kısa adı (ayar açıklaması). Düz dil: `lib/matrix/plain.ts`. */
export const MATRIX_KIND_LABEL: Record<MatrixKind, string> = MAP_KIND_PLAIN;

const ANATOMY_DESCRIPTION = "bir videonun açılış, giriş, gövde ve çağrı bölümleri";
const RIVAL_COMPARE = "kendi videolarının tutan rakip videolarından farkı";

export interface AnatomyPageCopy {
  title: string;
  description: string;
}

/**
 * Sayfa başlığı ve açıklaması harita listesine göre. Sekme adı "Kreatif anatomisi" değişmez; başlık hep o: haritanın adı bölüm
 * başlığındadır (yaklaşım haritası / konu ve açılış haritası). Açıklama haritaların cümlelerini + anatomiyi sıralar.
 */
export function anatomyPageCopy(kinds: readonly MatrixKind[]): AnatomyPageCopy {
  const description = [...kinds.map((kind) => MAP_DESCRIPTION_PLAIN[kind]), ANATOMY_DESCRIPTION, RIVAL_COMPARE].join("; ");
  return { title: ANATOMY_PAGE_TITLE, description: `${description.charAt(0).toLocaleUpperCase("tr-TR")}${description.slice(1)}.` };
}

/** Sayfa başlığı (ana gezinmedeki sekme adıyla aynı). */
export const ANATOMY_PAGE_TITLE = "Kreatif anatomisi";
