/**
 * Mock depo: koleksiyonlar ("Kaydet" / swipe file). Doğrulama `lib/data/collection-input.ts`'te, ad benzersizliği
 * `collectionNameKey`'de (tüm depo uygulamalarıyla ortak). `itemCount` üyelerden türetilir (tek doğruluk kaynağı).
 */
import { collectionNameKey, type Collection, type CollectionItem, type CollectionItemView } from "@/lib/domain/collection";
import { summarizeContent } from "@/lib/domain/content-summary";
import { parseCollectionName, parseCollectionNote, parseCreateCollectionInput, parseMembershipContentIds } from "@/lib/data/collection-input";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import type { StoredCollection } from "@/lib/data/mock/generators/collections";
import type { MockContext } from "@/lib/data/mock/repos/context";

export type CollectionMethods = Pick<
  PanelRepository,
  | "listCollections"
  | "getCollection"
  | "createCollection"
  | "renameCollection"
  | "deleteCollection"
  | "addToCollection"
  | "removeFromCollection"
  | "listCollectionsForContent"
  | "listCollectionMembership"
>;

export function createCollectionMethods(ctx: MockContext): CollectionMethods {
  const { state, clock, inWs, requireWs, findOrThrow, nextId, out } = ctx;

  const view = (stored: StoredCollection): Collection => ({
    ...stored,
    itemCount: state.collectionItems.filter((item) => item.collectionId === stored.id).length,
  });
  const newestFirst = (a: Collection, b: Collection) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, "tr-TR");

  /** Ad başka bir koleksiyonda kullanılıyorsa `already_exists` (`exceptId`: yeniden adlandırılan kendisi). */
  function assertNameFree(name: string, exceptId?: string): void {
    const key = collectionNameKey(name);
    if (state.collections.some((c) => c.id !== exceptId && collectionNameKey(c.name) === key)) {
      throw new RepositoryError("already_exists", `“${name}” adlı bir koleksiyon zaten var.`);
    }
  }

  return {
    async listCollections(wsId) {
      return inWs(wsId) ? out(state.collections.map(view).sort(newestFirst)) : [];
    },

    async getCollection(wsId, collectionId) {
      if (!inWs(wsId)) return null;
      const stored = state.collections.find((c) => c.id === collectionId);
      if (!stored) return null;
      const analysisByItem = new Map(state.analyses.map((a) => [a.contentItemId, a]));
      const items: CollectionItemView[] = [];
      for (const member of state.collectionItems.filter((m) => m.collectionId === collectionId)) {
        const content = state.content.find((c) => c.id === member.contentId);
        if (content) items.push({ ...member, content: summarizeContent(content, analysisByItem.get(content.id)) });
      }
      items.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.contentId.localeCompare(b.contentId));
      return out({ collection: view(stored), items });
    },

    async createCollection(wsId, input) {
      requireWs(wsId);
      const valid = parseCreateCollectionInput(input);
      assertNameFree(valid.name);
      const now = clock.tick();
      const stored: StoredCollection = {
        id: nextId("col"),
        workspaceId: wsId,
        name: valid.name,
        description: valid.description,
        createdAt: now,
        updatedAt: now,
      };
      state.collections.push(stored);
      return out(view(stored));
    },

    async renameCollection(wsId, collectionId, name) {
      requireWs(wsId);
      const stored = findOrThrow(state.collections, collectionId, "Koleksiyon");
      const valid = parseCollectionName(name);
      assertNameFree(valid, stored.id);
      stored.name = valid;
      stored.updatedAt = clock.tick();
      return out(view(stored));
    },

    async deleteCollection(wsId, collectionId) {
      requireWs(wsId);
      const stored = findOrThrow(state.collections, collectionId, "Koleksiyon");
      state.collections.splice(state.collections.indexOf(stored), 1);
      for (let i = state.collectionItems.length - 1; i >= 0; i--) {
        if (state.collectionItems[i].collectionId === collectionId) state.collectionItems.splice(i, 1);
      }
    },

    async addToCollection(wsId, collectionId, contentId, note) {
      requireWs(wsId);
      const stored = findOrThrow(state.collections, collectionId, "Koleksiyon");
      findOrThrow(state.content, contentId, "İçerik");
      const validNote = parseCollectionNote(note);

      const existing: CollectionItem | undefined = state.collectionItems.find((m) => m.collectionId === collectionId && m.contentId === contentId);
      if (existing) {
        // İdempotent: yeni kayıt yok, `addedAt` korunur; not yalnız verilirse değişir ("" siler).
        if (validNote !== undefined && validNote !== (existing.note ?? "")) {
          existing.note = validNote === "" ? undefined : validNote;
          stored.updatedAt = clock.tick();
        }
        return out(existing);
      }
      const item: CollectionItem = {
        collectionId,
        contentId,
        addedAt: clock.tick(),
        ...(validNote ? { note: validNote } : {}),
      };
      state.collectionItems.push(item);
      stored.updatedAt = item.addedAt;
      return out(item);
    },

    async removeFromCollection(wsId, collectionId, contentId) {
      requireWs(wsId);
      const stored = findOrThrow(state.collections, collectionId, "Koleksiyon");
      const at = state.collectionItems.findIndex((m) => m.collectionId === collectionId && m.contentId === contentId);
      if (at < 0) return; // İdempotent: zaten üye değil.
      state.collectionItems.splice(at, 1);
      stored.updatedAt = clock.tick();
    },

    async listCollectionsForContent(wsId, contentId) {
      if (!inWs(wsId)) return [];
      const ids = new Set(state.collectionItems.filter((m) => m.contentId === contentId).map((m) => m.collectionId));
      return out(state.collections.filter((c) => ids.has(c.id)).map(view).sort(newestFirst));
    },

    async listCollectionMembership(wsId, contentIds) {
      const wanted = parseMembershipContentIds(contentIds);
      const result: Record<string, string[]> = Object.fromEntries(wanted.map((id) => [id, []]));
      if (!inWs(wsId) || wanted.length === 0) return result;

      const requested = new Set(wanted);
      const collectionsByRecency = state.collections.map(view).sort(newestFirst);
      const byContent = new Map<string, Set<string>>();
      for (const member of state.collectionItems) {
        if (!requested.has(member.contentId)) continue;
        byContent.set(member.contentId, (byContent.get(member.contentId) ?? new Set()).add(member.collectionId));
      }
      for (const [contentId, collectionIds] of byContent) {
        result[contentId] = collectionsByRecency.filter((c) => collectionIds.has(c.id)).map((c) => c.id);
      }
      return result;
    },
  };
}
