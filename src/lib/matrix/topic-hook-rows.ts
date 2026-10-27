/**
 * Konu × hook türü matrisi: satır seçimi (saf). Satır = konu kümesi; ekran kalabalığı olmasın diye EN ÇOK `TOPIC_ROWS_MAX` satır döner: video
 * sayısı (kendi + rakip) en çok olan kümeler ayrı satır, kalanı tek "Diğer konular" satırında toplanır (hücreleri birleşik videolardan hesaplanır).
 * Küme anahtarı `diger` olan gerçek küme de "Diğer konular"a katılır (anahtar çakışması olmaz, anlamı da aynıdır). Sıra: video sayısı azalan,
 * eşitlikte küme anahtarı artan; "Diğer konular" her zaman SONDA.
 */
import { HOOK_TYPES, humanizeKey, type HookType } from "@/lib/domain/hook-types";
import type { TopicMembers } from "@/lib/matrix/topic-hook-cell";

/** Bir içeriğin güncel konu kümesi (`content_topic_clusters` satırı; satır yok = kümelenmedi). */
export interface TopicClusterAssignment {
  contentItemId: string;
  /** Taksonomi anahtar biçimi (`CLUSTER_KEY_PATTERN`). */
  clusterKey: string;
  /** Kısa Türkçe ad. */
  clusterLabel: string;
  /** ISO zaman: kümenin satır etiketi en yeni `clusteredAt` satırından alınır. */
  clusteredAt: string;
}

/** En çok satır ("Diğer konular" dahil). */
export const TOPIC_ROWS_MAX = 8;
/** "Diğer konular" satırının anahtarı (`CLUSTER_KEY_PATTERN`'e uyar) ve etiketi. */
export const TOPIC_OTHER_KEY = "diger";
export const TOPIC_OTHER_LABEL = "Diğer konular";

/** Küme anahtarı → hook türü → o hücredeki videolar. */
export type TopicGroups = Map<string, Map<HookType, TopicMembers>>;

/** Seçilen satır: anahtar, etiket ve hook türü başına üyeler. */
export interface SelectedRow {
  key: string;
  label: string;
  byHook: Map<HookType, TopicMembers>;
  /** "Diğer konular" satırı mı (birden çok kümenin toplamı: fırsat/tutan listelerine girmez). */
  isOther: boolean;
}

const videoCount = (byHook: Map<HookType, TopicMembers>): number => [...byHook.values()].reduce((sum, m) => sum + m.own.length + m.rivals.length, 0);

/**
 * Satır etiketi: kümenin EN YENİ `clusteredAt` satırındaki etiket (eşitlikte etiket metni küçük olan: deterministik). Boş etiket → anahtardan
 * okunur ad (DB check'i boş etiketi zaten reddeder; yalnız savunma).
 */
export function clusterLabels(assignments: readonly TopicClusterAssignment[]): Map<string, string> {
  const newest = new Map<string, TopicClusterAssignment>();
  for (const a of assignments) {
    const current = newest.get(a.clusterKey);
    if (current === undefined || a.clusteredAt > current.clusteredAt || (a.clusteredAt === current.clusteredAt && a.clusterLabel < current.clusterLabel)) {
      newest.set(a.clusterKey, a);
    }
  }
  return new Map([...newest].map(([key, a]) => [key, a.clusterLabel.trim() === "" ? humanizeKey(key) : a.clusterLabel]));
}

/** İki kümenin hücrelerini birleştirir (hook türü başına kendi/rakip listeleri art arda). */
function mergeGroups(parts: readonly Map<HookType, TopicMembers>[]): Map<HookType, TopicMembers> {
  const merged = new Map<HookType, TopicMembers>();
  for (const part of parts) {
    for (const [hook, members] of part) {
      const into = merged.get(hook) ?? { own: [], rivals: [] };
      into.own.push(...members.own);
      into.rivals.push(...members.rivals);
      merged.set(hook, into);
    }
  }
  return merged;
}

export function selectRows(groups: TopicGroups, labels: ReadonlyMap<string, string>): SelectedRow[] {
  const named = [...groups]
    .filter(([key]) => key !== TOPIC_OTHER_KEY)
    .map(([key, byHook]) => ({ key, byHook, count: videoCount(byHook) }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1));
  const forcedOther = groups.get(TOPIC_OTHER_KEY);
  const needOther = forcedOther !== undefined || named.length > TOPIC_ROWS_MAX;
  const keep = needOther ? Math.min(named.length, TOPIC_ROWS_MAX - 1) : named.length;

  const rows: SelectedRow[] = named.slice(0, keep).map(({ key, byHook }) => ({ key, label: labels.get(key) ?? humanizeKey(key), byHook, isOther: false }));
  if (needOther) {
    const tail = [...named.slice(keep).map((c) => c.byHook), ...(forcedOther === undefined ? [] : [forcedOther])];
    rows.push({ key: TOPIC_OTHER_KEY, label: TOPIC_OTHER_LABEL, byHook: mergeGroups(tail), isOther: true });
  }
  return rows;
}

/** Sütunlar: verisi olan hook türleri, `HOOK_TYPES` sırasıyla (boş sütun UI'yi kalabalıklaştırır). */
export function usedHookTypes(rows: readonly SelectedRow[]): HookType[] {
  return HOOK_TYPES.filter((hook) => rows.some((row) => row.byHook.has(hook)));
}
