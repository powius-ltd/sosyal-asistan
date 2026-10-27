/**
 * Kreatif Matris hücre seçimi: adres parametresi `?hucre=<katman>:<aci>` (ör. `?hucre=sorunu-biliyor:aci-korku`). Seçim bağlantıdır
 * (sunucu bileşeni; istemci durumu yok). Parametre YALNIZ taksonomideki değerlerle çözülür: bilinmeyen/bozuk değer `undefined`
 * (seçim yok), yoksayılır. Adres üretimi ve okuma TEK yerden.
 */
import { CREATIVE_ANGLE_IDS, FUNNEL_STAGE_IDS, type CreativeAngle, type FunnelStage } from "@/lib/domain/creative-matrix";
import { ANATOMY_VIDEO_PARAM, ROUTES } from "@/lib/routes";

export const MATRIX_CELL_PARAM = "hucre";

export interface MatrixCellRef {
  stage: FunnelStage;
  angle: CreativeAngle;
}

/** `"sorunu-biliyor:aci-korku"` → hücre; tanımsız ya da taksonomide olmayan değer → undefined. */
export function parseMatrixCell(raw: string | undefined): MatrixCellRef | undefined {
  if (raw === undefined) return undefined;
  const [stage, angle, ...rest] = raw.split(":");
  const knownStage = FUNNEL_STAGE_IDS.find((id) => id === stage);
  const knownAngle = CREATIVE_ANGLE_IDS.find((id) => id === angle);
  if (rest.length > 0 || knownStage === undefined || knownAngle === undefined) return undefined;
  return { stage: knownStage, angle: knownAngle };
}

/**
 * `/anatomi` adresi: hücre seçili ya da (verilmezse) seçimsiz. `video` verilirse anatomi bölümünün video seçimi korunur
 * (`?video=`): hücre seçmek aşağıdaki video seçimini sıfırlamaz. Kimlikler `[a-z-]`'dir, ":" kodlanmaz (okunur adres).
 */
export function matrixCellHref(cell: MatrixCellRef | undefined, video?: string): string {
  const params: string[] = [];
  if (cell !== undefined) params.push(`${MATRIX_CELL_PARAM}=${cell.stage}:${cell.angle}`);
  if (video !== undefined) params.push(`${ANATOMY_VIDEO_PARAM}=${encodeURIComponent(video)}`);
  return params.length === 0 ? ROUTES.anatomy : `${ROUTES.anatomy}?${params.join("&")}`;
}
