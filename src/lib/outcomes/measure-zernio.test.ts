import { describe, expect, it } from "vitest";

import { chooseZernioAccount, formatZernioResult, measureZernio } from "@/lib/outcomes/measure-zernio";
import type { ZernioSnapshotRow, ZernioStore, ZernioStoredSnapshot } from "@/lib/outcomes/measure-zernio-store";
import type { ZernioClient } from "@/lib/zernio/client";
import type { ZernioAccount, ZernioPost } from "@/lib/zernio/schema";

const WS = "ws-1";
const ACCOUNT: ZernioAccount = { _id: "z-acc", platform: "instagram", username: "ornek-studyo_app", isActive: true, followersCount: 46 };

const post = (code: string, views: number | null, extra: Partial<ZernioPost> = {}): ZernioPost => ({
  status: "published",
  platform: "instagram",
  mediaProductType: "REELS",
  platformPostUrl: `https://www.instagram.com/reel/${code}/`,
  publishedAt: "2026-10-17T17:31:05.000Z",
  content: "Açıklama #ai",
  analytics: { views, likes: 3, saves: 5, reach: 80 },
  platforms: [{ accountId: "z-acc" }],
  ...extra,
});

function fakeZernio(posts: ZernioPost[], accounts: ZernioAccount[] = [ACCOUNT]): ZernioClient {
  return { listAccounts: async () => accounts, listPosts: async () => posts };
}

function memoryStore(handles = ["ornek-studyo.app"]) {
  const content = new Map<string, string>(); // externalId → id
  const snapshots: (ZernioStoredSnapshot & ZernioSnapshotRow)[] = [];
  const store: ZernioStore = {
    listInstagramAccounts: async () => handles.map((handle, i) => ({ id: `own-${i}`, handle })),
    findContentByExternalIds: async (_ws, ids) => new Map(ids.flatMap((id) => (content.has(id) ? [[id, content.get(id)!] as const] : []))),
    insertContent: async (_ws, _acc, fields) => {
      const id = `c-${content.size + 1}`;
      content.set(fields.externalId, id);
      return id;
    },
    listZernioSnapshotsSince: async (_ws, ids, since) => snapshots.filter((s) => ids.includes(s.content_item_id) && s.captured_at >= since),
    insertSnapshot: async (row) => {
      snapshots.push({ ...(row as ZernioSnapshotRow), id: `s-${snapshots.length + 1}` } as ZernioStoredSnapshot & ZernioSnapshotRow);
    },
    updateSnapshot: async (id, row) => {
      const i = snapshots.findIndex((s) => s.id === id);
      snapshots[i] = { ...(row as ZernioSnapshotRow), id } as ZernioStoredSnapshot & ZernioSnapshotRow;
    },
  };
  return { store, content, snapshots };
}

const at = (iso: string) => ({ workspaceId: WS, now: new Date(iso), dryRun: false });

describe("chooseZernioAccount", () => {
  it("nokta / alt çizgi farkını yok sayarak eşleştirir", () => {
    expect(chooseZernioAccount([ACCOUNT], ["ornek-studyo.app"]).account?._id).toBe("z-acc");
  });
  it("tek Instagram hesabı olsa da tutamak farklıysa reddeder (tek hesap yedeği yok)", () => {
    const chosen = chooseZernioAccount([ACCOUNT], ["baska"]);
    expect(chosen.account).toBeUndefined();
    expect(chosen.reason).toMatch(/eşleşmiyor/);
  });
  it("birden çok hesap ve eşleşme yoksa reddeder; hiç hesap yoksa da", () => {
    const other: ZernioAccount = { ...ACCOUNT, _id: "z2", username: "diger" };
    expect(chooseZernioAccount([ACCOUNT, other], ["baska"]).account).toBeUndefined();
    expect(chooseZernioAccount([], ["x"]).reason).toMatch(/bağlı Instagram/);
    expect(chooseZernioAccount([{ ...ACCOUNT, platform: "tiktok" }], ["x"]).account).toBeUndefined();
  });
});

describe("measureZernio", () => {
  it("yeni Reels içeriğini ve ölçümü yazar (source zernio, ig_views, ölçülemeyen NULL)", async () => {
    const { store, snapshots } = memoryStore();
    const result = await measureZernio(at("2026-10-20T06:00:00Z"), { zernio: fakeZernio([post("DZ263dUNsyC", 100), post("DbRDbObAwQ1", null)]), store });
    expect(result).toMatchObject({ outcome: "completed", reels: 2, contentCreated: 2, snapshotsInserted: 2 });
    expect(snapshots[0]).toMatchObject({ source: "zernio", views: 100, views_kind: "ig_views", saves: 5, owner_followers: 46, avg_watch_sec: null });
    expect(snapshots[1]).toMatchObject({ views: null, views_kind: null });
  });

  it("aynı gün ikinci koşu yeni satır üretmez; değişen değer o günün satırını günceller", async () => {
    const { store, snapshots } = memoryStore();
    const posts = [post("DZ263dUNsyC", 100)];
    await measureZernio(at("2026-10-20T06:00:00Z"), { zernio: fakeZernio(posts), store });
    const same = await measureZernio(at("2026-10-20T09:00:00Z"), { zernio: fakeZernio(posts), store });
    expect(same).toMatchObject({ snapshotsInserted: 0, snapshotsUnchanged: 1, contentExisting: 1, contentCreated: 0 });
    const changed = await measureZernio(at("2026-10-20T18:00:00Z"), { zernio: fakeZernio([post("DZ263dUNsyC", 150)]), store });
    expect(changed).toMatchObject({ snapshotsInserted: 0, snapshotsUpdated: 1 });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].views).toBe(150);
  });

  it("ertesi gün (İstanbul) yeni satır yazar", async () => {
    const { store, snapshots } = memoryStore();
    await measureZernio(at("2026-10-20T06:00:00Z"), { zernio: fakeZernio([post("DZ263dUNsyC", 100)]), store });
    // 20:30 UTC = 23:30 İstanbul (aynı gün); 21:30 UTC = ertesi gün 00:30 İstanbul.
    await measureZernio(at("2026-10-20T20:30:00Z"), { zernio: fakeZernio([post("DZ263dUNsyC", 120)]), store });
    expect(snapshots).toHaveLength(1);
    await measureZernio(at("2026-10-20T21:30:00Z"), { zernio: fakeZernio([post("DZ263dUNsyC", 130)]), store });
    expect(snapshots).toHaveLength(2);
  });

  it("kuru koşu hiçbir şey yazmaz ama sayıları söyler", async () => {
    const { store, content, snapshots } = memoryStore();
    const result = await measureZernio({ ...at("2026-10-20T06:00:00Z"), dryRun: true }, { zernio: fakeZernio([post("DZ263dUNsyC", 1), post("DbRDbObAwQ1", 2)]), store });
    expect(result).toMatchObject({ outcome: "dry_run", contentCreated: 2, snapshotsInserted: 2 });
    expect(content.size).toBe(0);
    expect(snapshots).toHaveLength(0);
  });

  it("başka hesabın ve Reels olmayan gönderileri atlar", async () => {
    const { store } = memoryStore();
    const result = await measureZernio(at("2026-10-20T06:00:00Z"), {
      zernio: fakeZernio([post("DZ263dUNsyC", 1), post("DbRDbObAwQ1", 2, { platforms: [{ accountId: "baska" }] }), post("DdEfUjzg2yn", 3, { mediaProductType: "FEED" })]),
      store,
    });
    expect(result.reels).toBe(1);
    expect(result.skipped).toEqual({ other_account: 1, not_reel: 1 });
  });

  it("Zernio hesabı yoksa no_account döner ve yazmaz", async () => {
    const { store, snapshots } = memoryStore();
    const result = await measureZernio(at("2026-10-20T06:00:00Z"), { zernio: fakeZernio([post("DZ263dUNsyC", 1)], []), store });
    expect(result.outcome).toBe("no_account");
    expect(snapshots).toHaveLength(0);
  });

  it("çalışma alanında Instagram hesabı yoksa no_account", async () => {
    const { store } = memoryStore([]);
    expect((await measureZernio(at("2026-10-20T06:00:00Z"), { zernio: fakeZernio([]), store })).outcome).toBe("no_account");
  });

  it("çıktı satırları kişisel veri ve anahtar içermez", () => {
    const lines = formatZernioResult({ outcome: "completed", dryRun: false, reels: 2, skipped: { not_reel: 1 }, contentCreated: 1, contentExisting: 1, snapshotsInserted: 2, snapshotsUpdated: 0, snapshotsUnchanged: 0, notes: [] });
    expect(lines.join("\n")).toContain("2 yeni satır");
  });
});
