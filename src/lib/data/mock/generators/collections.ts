/**
 * Mock üreteci: 3 koleksiyon, toplam 12 öğe. İçerikler yüksek lift'li rakip kısa videolarından (deterministik) seçilir;
 * bir içerik iki koleksiyonda bulunur (`listCollectionsForContent` örneği), bir kendi içerik "Çekilecekler"dedir.
 */
import type { CollectionItem, Collection } from "@/lib/domain/collection";
import type { ContentItem } from "@/lib/domain/content";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";
import type { ContentMeta } from "@/lib/data/mock/generators/content";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import type { Rng } from "@/lib/data/mock/prng";

/** Depoda saklanan koleksiyon: `itemCount` üyelerden türetilir, saklanmaz. */
export type StoredCollection = Omit<Collection, "itemCount">;

export interface CollectionsResult {
  collections: StoredCollection[];
  items: CollectionItem[];
}

interface CollectionSpec {
  id: string;
  name: string;
  description: string;
  createdAge: number;
  /** Bu koleksiyona girecek içerik sayısı. */
  size: number;
  /** Öncelikli konu anahtarları (boşsa yalnız lift sırası). */
  topics: string[];
  /** Kendi hesabın içeriğinden kaç öğe eklenir. */
  own?: number;
}

const SPECS: CollectionSpec[] = [
  { id: "col_01", name: "Hook ilhamı", description: "Açılışı güçlü, tekrar bakacağım tutan videolar.", createdAge: 26, size: 5, topics: [] },
  { id: "col_02", name: "Prompt formülleri", description: "Prompt şablonu ya da komut kalıbı veren videolar.", createdAge: 15, size: 4, topics: ["prompt_formula", "email"] },
  { id: "col_03", name: "Çekilecekler", description: "Bu ay kendi hesabımda denemek istediklerim.", createdAge: 7, size: 3, topics: ["automation", "notion_system"], own: 1 },
];

const NOTES = [
  "Açılış cümlesi çok net; aynısını e-posta konusuyla dene.",
  "3 adımlı yapı, script taslağına uygun.",
  "Kendi versiyonumu ekran kaydıyla çekeceğim.",
];

export function buildCollections(rng: Rng, clock: MockClock, items: ContentItem[], meta: Map<string, ContentMeta>): CollectionsResult {
  const byLift = items
    .filter((c) => c.owner.kind === "competitor" && c.format === "short_video" && c.score.lift !== undefined)
    .sort((a, b) => (b.score.lift ?? 0) - (a.score.lift ?? 0) || a.id.localeCompare(b.id));
  const bestOwn = items
    .filter((c) => c.owner.kind === "own" && c.format === "short_video" && c.score.lift !== undefined)
    .sort((a, b) => (b.score.lift ?? 0) - (a.score.lift ?? 0) || a.id.localeCompare(b.id))[0];
  const used = new Set<string>();
  const collections: StoredCollection[] = [];
  const members: CollectionItem[] = [];
  let noteAt = 0;

  for (const spec of SPECS) {
    const topical = byLift.filter((c) => spec.topics.includes(meta.get(c.id)?.topicKey ?? ""));
    const pool = [...topical, ...byLift.filter((c) => !topical.includes(c))].filter((c) => !used.has(c.id));
    const chosen: ContentItem[] = pool.slice(0, spec.size - (spec.own ?? 0));
    // Çakışma örneği: en tutan içerik (1. koleksiyonun ilki) 3. koleksiyonda da yer alır.
    if (spec.id === "col_03" && byLift[0]) chosen[0] = byLift[0];
    if (spec.own && bestOwn) chosen.push(bestOwn);
    for (const c of chosen) if (spec.id !== "col_03") used.add(c.id);

    let latest = clock.daysAgo(spec.createdAge);
    chosen.forEach((c, i) => {
      const addedAt = clock.daysAgo(Math.max(spec.createdAge - 1 - i * rng.float(0.6, 2.2), 0.2));
      if (addedAt > latest) latest = addedAt;
      members.push({
        collectionId: spec.id,
        contentId: c.id,
        addedAt,
        ...(i % 2 === 0 && noteAt < NOTES.length ? { note: NOTES[noteAt++] } : {}),
      });
    });
    collections.push({
      id: spec.id,
      workspaceId: WS,
      name: spec.name,
      description: spec.description,
      createdAt: clock.daysAgo(spec.createdAge),
      updatedAt: latest,
    });
  }
  return { collections, items: members };
}
