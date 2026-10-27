/**
 * Konu × hook türü matrisi hücre seçimi: adres parametresi `?konu=<küme>:<hook>` (ör. `?konu=sabah_rutini:question`). Seçim bağlantıdır
 * (sunucu bileşeni; istemci durumu yok). Açı × farkındalık matrisinin `?hucre=` parametresinden (`cell-param.ts`) AYRIDIR: ikisi aynı sayfada
 * (karma hesap) birlikte durabilir. Küme anahtarı taksonomi anahtar biçimine (`CLUSTER_KEY_PATTERN`), hook türü `HOOK_TYPES`'a uymalıdır:
 * bozuk değer `undefined` (seçim yok), yoksayılır. Küme anahtarının VAR olup olmadığına parametre bakmaz (veriye bağlıdır): ekran, matriste
 * olmayan kümeyi seçimsiz sayar. Adres üretimi ve okuma TEK yerden.
 */
import { CLUSTER_KEY_PATTERN } from "@/lib/domain/topic-hook-matrix";
import { HOOK_TYPES, type HookType } from "@/lib/domain/hook-types";
import { ANATOMY_VIDEO_PARAM, ROUTES } from "@/lib/routes";

export const TOPIC_CELL_PARAM = "konu";

export interface TopicCellRef {
  clusterKey: string;
  hookType: HookType;
}

/** `"sabah_rutini:question"` → hücre; tanımsız, biçimsiz küme anahtarı ya da sözlükte olmayan hook türü → undefined. */
export function parseTopicCell(raw: string | undefined): TopicCellRef | undefined {
  if (raw === undefined) return undefined;
  const [clusterKey, hookType, ...rest] = raw.split(":");
  if (rest.length > 0 || clusterKey === undefined || hookType === undefined) return undefined;
  const knownHook = HOOK_TYPES.find((type) => type === hookType);
  return CLUSTER_KEY_PATTERN.test(clusterKey) && knownHook !== undefined ? { clusterKey, hookType: knownHook } : undefined;
}

/** `/anatomi` adresi: konu hücresi seçili (`?konu=`) ya da seçimsiz; `video` verilirse anatomi bölümünün video seçimi korunur (`?video=`). */
export function topicCellHref(cell: TopicCellRef | undefined, video?: string): string {
  const params: string[] = [];
  if (cell !== undefined) params.push(`${TOPIC_CELL_PARAM}=${cell.clusterKey}:${cell.hookType}`);
  if (video !== undefined) params.push(`${ANATOMY_VIDEO_PARAM}=${encodeURIComponent(video)}`);
  return params.length === 0 ? ROUTES.anatomy : `${ROUTES.anatomy}?${params.join("&")}`;
}
