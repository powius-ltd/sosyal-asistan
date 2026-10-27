/**
 * Sözleşme parçası: bildirimler, uyarı ayarları ve haftalık özet.
 *
 * Temizlik: uyarı ayarları test sonunda özgün değerlere yazılır. Bildirimi okundu yapmak geri alınamaz (okunmadı'ya
 * dönüş API'si yok) ve serbesttir: okunmamış bildirim kalmadıysa ilgili doğrulama atlanır, idempotentlik okunmuş
 * bildirimle sınanır.
 */
import { expect, it } from "vitest";

import { OUTLIER_MIN_TIER } from "@/lib/domain/content";
import { NOTIFICATION_KINDS, type AlertSettings } from "@/lib/domain/notification";
import { DAY_MS } from "@/lib/time";
import { MAX_PAGE_LIMIT, type AlertSettingsPatch } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";
import { allPages, expectCode, MISSING_ID, ms, type ContractContext } from "@/lib/data/contract/support";

/** Ayarları özgün değerlere döndüren yama (her alan açık; e-posta adresi yoksa "" siler). */
function restorePatch(before: AlertSettings): AlertSettingsPatch {
  return {
    competitorOutlier: { ...before.competitorOutlier },
    ownOutlier: { ...before.ownOutlier },
    weeklyDigest: { ...before.weeklyDigest },
    channels: {
      email: { enabled: before.channels.email?.enabled ?? false, address: before.channels.email?.address ?? "" },
      telegram: { enabled: before.channels.telegram?.enabled ?? false },
    },
  };
}

export function notificationsContract(ctx: ContractContext): void {
  const { wsId, foreign, create, allContent } = ctx;

  /**
   * TÜM bildirimler: imleçle sayfa sayfa gezilir (küçük sayfa boyu imleci gerçekten sınar). İmleç ilerlemiyorsa ya da
   * sayfa üst sınırı aşılırsa test SESSİZCE kırpmaz, açıkça başarısız olur (ilk sayfayla yetinen sahte yeşil olmaz).
   * Her sayfanın `total`'ı aynıdır (sayfa değil süzgeçteki toplam).
   */
  async function allNotifications(r: PanelRepository, unreadOnly?: boolean) {
    const PAGE_SIZE = 5;
    let total: number | undefined;
    const items = await allPages(async (cursor) => {
      const res = await r.listNotifications(wsId, { unreadOnly, limit: PAGE_SIZE, cursor });
      expect(res.items.length, "sayfa boyunu aşmaz").toBeLessThanOrEqual(PAGE_SIZE);
      expect(res.total, "her sayfada aynı toplam").toBe(total ?? res.total);
      total = res.total;
      return res;
    });
    expect(total, "toplam, gezilen kayıt sayısıdır").toBe(items.length);
    return items;
  }

  it("bildirimler: alan kuralları, yeniden eskiye, sayfalama tam ve tekrarsız, okunmamış sayısı listeyle tutarlı", async () => {
    const r = create();
    const all = await allNotifications(r);
    expect(all.length, "seed: en az bir bildirim").toBeGreaterThan(0);
    expect(new Set(all.map((n) => n.id)).size, "sayfalar tekrarsız").toBe(all.length);
    for (const n of all) {
      expect(n.workspaceId, n.id).toBe(wsId);
      expect(NOTIFICATION_KINDS, n.id).toContain(n.kind);
      expect(n.title.trim(), n.id).toBeTruthy();
      expect(n.body.trim(), n.id).toBeTruthy();
      if (n.readAt !== undefined) expect(n.readAt >= n.createdAt, `${n.id}: okunma zamanı oluşmadan önce olamaz`).toBe(true);
      if (n.contentId !== undefined) expect(await r.getContent(wsId, n.contentId), `${n.id}: bağlı içerik var`).not.toBeNull();
    }
    const created = all.map((n) => n.createdAt);
    expect(created, "yeniden eskiye").toEqual([...created].sort((a, b) => b.localeCompare(a)));

    const unread = all.filter((n) => n.readAt === undefined);
    expect(await r.countUnreadNotifications(wsId)).toBe(unread.length);
    // Okunmamışlar da TÜM sayfalarıyla gezilir (ilk sayfa tümü sanılmaz) ve süzgeçsiz listenin sırasını korur.
    expect((await allNotifications(r, true)).map((n) => n.id)).toEqual(unread.map((n) => n.id));
    expect((await r.listNotifications(wsId, { unreadOnly: true, limit: 1 })).total).toBe(unread.length);
    expect((await r.listNotifications(wsId, { limit: 1 })).items.length).toBeLessThanOrEqual(1);
    expect((await r.listNotifications(wsId)).total).toBe(all.length);
  });

  it("okundu işaretleme: markNotificationRead idempotent (ilk okunma zamanı korunur), markAllNotificationsRead sayıyı döndürür", async () => {
    const r = create();
    const before = await allNotifications(r);
    const unread = before.filter((n) => n.readAt === undefined);
    const read = before.find((n) => n.readAt !== undefined);

    if (unread.length > 0) {
      const target = unread[0];
      const marked = await r.markNotificationRead(wsId, target.id);
      expect(marked.id).toBe(target.id);
      expect(marked.readAt).toBeDefined();
      expect(await r.countUnreadNotifications(wsId)).toBe(unread.length - 1);
      const again = await r.markNotificationRead(wsId, target.id);
      expect(again.readAt, "ikinci çağrı ilk okunma zamanını korur").toBe(marked.readAt);
      expect(await r.countUnreadNotifications(wsId)).toBe(unread.length - 1);
    }
    if (read) expect((await r.markNotificationRead(wsId, read.id)).readAt, "okunmuşa dokunulmaz").toBe(read.readAt);
    await expectCode(r.markNotificationRead(wsId, MISSING_ID), "not_found");

    const remaining = await r.countUnreadNotifications(wsId);
    expect(await r.markAllNotificationsRead(wsId), "bu çağrıda okundu yapılan sayı").toBe(remaining);
    expect(await r.countUnreadNotifications(wsId)).toBe(0);
    expect((await r.listNotifications(wsId, { unreadOnly: true })).items).toEqual([]);
    expect(await r.markAllNotificationsRead(wsId), "tekrar çağrı: 0").toBe(0);
  });

  it("uyarı ayarları: geçerli aralıklar, sır yok (yalnız 'ayarlı mı'), yalnız verilen alan değişir ve özgün değere döner", async () => {
    const r = create();
    const before = await r.getAlertSettings(wsId);
    expect(before.channels.inApp).toBe(true);
    for (const rule of [before.competitorOutlier, before.ownOutlier]) {
      expect(typeof rule.enabled).toBe("boolean");
      expect([1, 2, 3, 4]).toContain(rule.minTier);
    }
    expect(Number.isInteger(before.weeklyDigest.weekday) && before.weeklyDigest.weekday >= 0 && before.weeklyDigest.weekday <= 6).toBe(true);
    expect(Number.isInteger(before.weeklyDigest.hour) && before.weeklyDigest.hour >= 0 && before.weeklyDigest.hour <= 23).toBe(true);
    // Sır alanları domain'e girmez: Telegram yalnız enabled + chatIdSet, e-posta yalnız enabled + address.
    if (before.channels.telegram) expect(Object.keys(before.channels.telegram).sort()).toEqual(["chatIdSet", "enabled"]);
    if (before.channels.email) expect(Object.keys(before.channels.email).every((k) => ["enabled", "address"].includes(k))).toBe(true);

    try {
      const updated = await r.updateAlertSettings(wsId, {
        competitorOutlier: { minTier: before.competitorOutlier.minTier === 4 ? 2 : 4 },
        weeklyDigest: { weekday: (before.weeklyDigest.weekday + 3) % 7, hour: (before.weeklyDigest.hour + 5) % 24, enabled: !before.weeklyDigest.enabled },
        ownOutlier: { enabled: !before.ownOutlier.enabled },
      });
      expect(updated.competitorOutlier.minTier).not.toBe(before.competitorOutlier.minTier);
      expect(updated.competitorOutlier.enabled, "verilmeyen alan değişmez").toBe(before.competitorOutlier.enabled);
      expect(updated.ownOutlier).toEqual({ ...before.ownOutlier, enabled: !before.ownOutlier.enabled });
      expect(updated.weeklyDigest).toEqual({ enabled: !before.weeklyDigest.enabled, weekday: (before.weeklyDigest.weekday + 3) % 7, hour: (before.weeklyDigest.hour + 5) % 24 });
      expect(updated.channels, "kanallara dokunulmadı").toEqual(before.channels);
      expect(await r.getAlertSettings(wsId)).toEqual(updated);
      expect(await r.updateAlertSettings(wsId, {}), "boş yama değişiklik yapmaz").toEqual(updated);
      const boundary = await r.updateAlertSettings(wsId, { weeklyDigest: { weekday: 6, hour: 23 } });
      expect([boundary.weeklyDigest.weekday, boundary.weeklyDigest.hour]).toEqual([6, 23]);
      expect((await r.updateAlertSettings(wsId, { weeklyDigest: { weekday: 0, hour: 0 } })).weeklyDigest).toMatchObject({ weekday: 0, hour: 0 });
    } finally {
      await r.updateAlertSettings(wsId, restorePatch(before));
    }
    expect(await r.getAlertSettings(wsId)).toEqual(before);
  });

  it("uyarı ayarları: geçersiz yama invalid_input (durum değişmez); e-posta adresi ister; sohbeti bağlı olmayan Telegram invalid_state", async () => {
    const r = create();
    const before = await r.getAlertSettings(wsId);
    const bad: unknown[] = [
      { weeklyDigest: { weekday: 7 } },
      { weeklyDigest: { weekday: -1 } },
      { weeklyDigest: { hour: 24 } },
      { weeklyDigest: { hour: 9.5 } },
      { weeklyDigest: { hour: "9" } },
      { competitorOutlier: { minTier: 0 } },
      { ownOutlier: { minTier: 5 } },
      { ownOutlier: { minTier: 2.5 } },
      { competitorOutlier: { enabled: "evet" } },
      { channels: { inApp: false } }, // uygulama içi kanal kapatılamaz
      { channels: { telegram: { chatIdSet: true } } }, // sohbet bağlama sunucuda; yamada yok
      { channels: { telegram: { token: "123:ABC" } } }, // sır yamaya giremez
      { channels: { email: { password: "x" } } },
      { channels: { email: { address: "bu-bir-adres-degil" } } },
      { channels: { email: { address: `${"a".repeat(250)}@x.co` } } },
      { bilinmeyen: 1 },
      null,
      "yama",
    ];
    for (const patch of bad) await expectCode(r.updateAlertSettings(wsId, patch as AlertSettingsPatch), "invalid_input");
    expect(await r.getAlertSettings(wsId)).toEqual(before);

    try {
      // Adressiz e-posta kanalı açılamaz.
      await r.updateAlertSettings(wsId, { channels: { email: { enabled: false, address: "" } } });
      await expectCode(r.updateAlertSettings(wsId, { channels: { email: { enabled: true } } }), "invalid_input");
      const withAddress = await r.updateAlertSettings(wsId, { channels: { email: { enabled: true, address: "  sozlesme@example.com " } } });
      expect(withAddress.channels.email).toEqual({ enabled: true, address: "sozlesme@example.com" });
      // Açıkken adresi silmek reddedilir; kapatıp silmek serbest.
      await expectCode(r.updateAlertSettings(wsId, { channels: { email: { address: "" } } }), "invalid_input");
      expect((await r.getAlertSettings(wsId)).channels.email?.address).toBe("sozlesme@example.com");
      const cleared = await r.updateAlertSettings(wsId, { channels: { email: { enabled: false, address: "" } } });
      expect(cleared.channels.email?.enabled).toBe(false);
      expect(cleared.channels.email?.address).toBeUndefined();

      // Sohbeti bağlı olmayan Telegram açılamaz (bağlama sunucu tarafında; yamayla set edilemez).
      const telegram = (await r.getAlertSettings(wsId)).channels.telegram;
      if (telegram && !telegram.chatIdSet) {
        await expectCode(r.updateAlertSettings(wsId, { channels: { telegram: { enabled: true } } }), "invalid_state");
        expect((await r.getAlertSettings(wsId)).channels.telegram?.enabled).toBe(false);
      }
    } finally {
      await r.updateAlertSettings(wsId, restorePatch(before));
    }
    expect(await r.getAlertSettings(wsId)).toEqual(before);
  });

  it("haftalık özet: dönem now'dan geriye 7 gün; içerikler dönemde ve doğru sahipte; ölçülemeyen undefined + sebep; sayaçlar ideelerle tutarlı", async () => {
    const r = create();
    const content = await allContent(r);
    const latest = Math.max(...content.map((c) => ms(c.publishedAt) ?? 0));
    const now = new Date(latest + 3_600_000);
    const start = now.getTime() - 7 * DAY_MS;
    const digest = await r.getWeeklyDigest(wsId, now);

    expect(digest.periodEnd).toBe(now.toISOString());
    expect(digest.periodStart).toBe(new Date(start).toISOString());
    expect(await r.getWeeklyDigest(wsId, now), "aynı girdi aynı özet").toEqual(digest);
    const inPeriod = (iso?: string) => (ms(iso) ?? Number.NEGATIVE_INFINITY) > start && (ms(iso) ?? Number.NEGATIVE_INFINITY) <= now.getTime();

    expect(digest.own.topContent.length).toBeLessThanOrEqual(3);
    for (const c of digest.own.topContent) {
      const detail = await r.getContent(wsId, c.contentItemId);
      expect(detail?.item.owner.kind, `${c.contentItemId}: kendi içerik`).toBe("own");
      expect(inPeriod(detail?.item.publishedAt), `${c.contentItemId}: dönemde yayınlanmış`).toBe(true);
      if (c.views !== undefined) expect(c.views).toBe(detail?.item.metrics.views);
    }
    expect(digest.competitors.newOutliers.length).toBeLessThanOrEqual(5);
    // Tutanların TÜM sayfaları (ilk sayfa tüm küme sanılmaz).
    const outlierIds = new Set((await allPages((cursor) => r.listOutliers(wsId, { limit: MAX_PAGE_LIMIT, cursor }))).map((c) => c.id));
    for (const c of digest.competitors.newOutliers) {
      expect(outlierIds.has(c.contentItemId), `${c.contentItemId}: Tutanlar ile aynı küme (izlenen rakip)`).toBe(true);
      expect(c.currentLift ?? 0).toBeGreaterThanOrEqual(3);
      expect(OUTLIER_MIN_TIER).toBe(3);
      expect(inPeriod((await r.getContent(wsId, c.contentItemId))?.item.publishedAt)).toBe(true);
    }
    if (digest.competitors.mostActive) expect(digest.competitors.mostActive.posts).toBeGreaterThan(0);

    // undefined ≠ 0: değer ↔ sebep birbirini dışlar.
    const reasons = digest.unmeasuredReasons;
    expect([digest.own.followersDelta === undefined, digest.own.views === undefined, digest.competitors.mostActive === undefined])
      .toEqual([reasons.followersDelta !== undefined, reasons.views !== undefined, reasons.mostActive !== undefined]);

    const ideas = await r.listIdeas(wsId, { limit: MAX_PAGE_LIMIT });
    expect(digest.ideas.new).toBe(ideas.filter((i) => inPeriod(i.createdAt)).length);
    expect(digest.ideas.scripted).toBe(ideas.filter((i) => ["scripted", "scheduled", "published"].includes(i.status) && inPeriod(i.updatedAt)).length);

    // Hiç veri olmayan bir dönem (içerikten yıllar önce): boş listeler, sıfır sayaç, ölçülemeyenler undefined + sebep.
    const empty = await r.getWeeklyDigest(wsId, new Date(latest - 3650 * DAY_MS));
    expect([empty.own.topContent, empty.competitors.newOutliers]).toEqual([[], []]);
    expect(empty.ideas).toEqual({ new: 0, scripted: 0 });
    expect(empty.own.followersDelta).toBeUndefined();
    expect(empty.unmeasuredReasons.followersDelta).toBeTruthy();
    expect(empty.competitors.mostActive).toBeUndefined();
    expect(empty.unmeasuredReasons.mostActive).toBeTruthy();
  });

  it("bilinmeyen workspace: liste boş; sayaç, ayar, özet ve yazmalar not_found", async () => {
    const r = create();
    const [any] = await allNotifications(r);
    expect((await r.listNotifications(foreign)).items).toEqual([]);
    await expectCode(r.countUnreadNotifications(foreign), "not_found");
    await expectCode(r.getAlertSettings(foreign), "not_found");
    await expectCode(r.updateAlertSettings(foreign, { weeklyDigest: { hour: 8 } }), "not_found");
    await expectCode(r.markNotificationRead(foreign, any?.id ?? MISSING_ID), "not_found");
    await expectCode(r.markAllNotificationsRead(foreign), "not_found");
    await expectCode(r.getWeeklyDigest(foreign, new Date()), "not_found");
  });
}
