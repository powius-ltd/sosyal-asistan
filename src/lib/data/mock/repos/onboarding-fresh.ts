/**
 * Mock: GERÇEKTEN boş hesap çeşidi (`MOCK_ONBOARDING=<adım>`). Taze hesapta tohumlu veri (içerik, ölçüm, koşu, plan, fikir, bildirim)
 * akışın olgusu değildir: gerçek bir yeni hesapta ilk toplamaya kadar bunların hiçbiri yoktur. Bu yüzden başlangıçta kenara alınır
 * (Bugün "henüz bakmadım" der, "planın hazır / X kararın var" demez) ve ilk inceleme (`build`) bitince geri konur. Diziler yerinde
 * boşaltılır / doldurulur: depo metotları `state.<alan>` referansını tuttuğu için başka yerde kopya oluşmaz.
 */
import type { OwnAccount } from "@/lib/domain/competitor";
import type { MockContext } from "@/lib/data/mock/repos/context";
import type { MockDataset } from "@/lib/data/mock/generators/dataset";

/** Boşaltılan liste alanları (hesabın kendi verisi; rakip / hesap kayıtları ve iş satırları kalır). */
const LISTS = [
  "content",
  "snapshots",
  "accountSnapshots",
  "transcripts",
  "analyses",
  "topicScreens",
  "ideas",
  "publishJobs",
  "runs",
  "collections",
  "collectionItems",
  "weeklyPlans",
  "voiceProfiles",
  "notifications",
] as const satisfies readonly (keyof MockDataset)[];

/** Boşaltılan sözlük alanları. */
const MAPS = ["baselines", "contentMeta"] as const satisfies readonly (keyof MockDataset)[];

/** Hesabın profil sayıları: hesaba bakış gelene kadar bilinmez (gerçek yeni hesapta da boştur). */
const PROFILE_FIELDS = ["followers", "lastSyncedAt"] as const;

export interface FreshData {
  /** Kenara alınmadan önceki içerik sayısı (hesaba bakışın "bulduğum video" sayısı bundan türer). */
  seededContentCount(): number;
  /** Kenara alınmadan önceki takipçi sayısı (hesaba bakış bunu "buldu"). */
  seededFollowers(accountId: string): number | undefined;
  /** Veriyi kenara alır (bir kez). */
  clear(): void;
  /** Hesaba bakış bitti: profil sayıları (takipçi) geri gelir; içerik / plan ilk incelemeyi bekler. */
  restoreProfile(): void;
  /** Kenara alınan her şeyi geri koyar; sonradan eklenenler (ör. bitiş bildirimi) korunur. */
  restore(): void;
}

export function createFreshData(ctx: MockContext): FreshData {
  const { state, snapshotsByItem } = ctx;
  let lists: Map<(typeof LISTS)[number], unknown[]> | undefined;
  let maps: Map<(typeof MAPS)[number] | "snapshotsByItem", Map<unknown, unknown>> | undefined;
  let contentCount = state.content.length;
  const profiles = new Map<string, Partial<Pick<OwnAccount, (typeof PROFILE_FIELDS)[number]>>>();

  const mapOf = (key: (typeof MAPS)[number] | "snapshotsByItem") => (key === "snapshotsByItem" ? snapshotsByItem : (state[key] as Map<unknown, unknown>));

  function restoreProfile(): void {
    for (const account of state.ownAccounts) Object.assign(account, profiles.get(account.id));
  }

  return {
    seededContentCount: () => contentCount,

    seededFollowers: (accountId) => profiles.get(accountId)?.followers ?? state.ownAccounts.find((account) => account.id === accountId)?.followers,

    clear() {
      if (lists !== undefined) return;
      contentCount = state.content.length;
      lists = new Map(LISTS.map((key) => [key, (state[key] as unknown[]).splice(0)]));
      maps = new Map([...MAPS, "snapshotsByItem" as const].map((key) => [key, new Map(mapOf(key))]));
      for (const key of maps.keys()) mapOf(key).clear();
      for (const account of state.ownAccounts) {
        profiles.set(account.id, { followers: account.followers, lastSyncedAt: account.lastSyncedAt });
        for (const field of PROFILE_FIELDS) delete account[field];
      }
    },

    restoreProfile,

    restore() {
      if (lists === undefined || maps === undefined) return;
      restoreProfile();
      for (const [key, items] of lists) (state[key] as unknown[]).unshift(...items);
      for (const [key, entries] of maps) for (const [id, value] of entries) mapOf(key).set(id, value);
      lists = undefined;
      maps = undefined;
    },
  };
}
