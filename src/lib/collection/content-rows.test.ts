import { describe, expect, it } from "vitest";
import { ownerColumns, toContentRow, toCount, toSnapshotRow } from "@/lib/collection/content-rows";
import { parseContent } from "@/lib/platforms/instagram/normalize-content";
import { loadFixture, reelRow } from "@/lib/platforms/instagram/test-support";
import type { NormalizedContent } from "@/lib/platforms/types";
import type { ScoringOwner } from "@/lib/scoring/types";

const WS = "11111111-1111-4111-8111-111111111111";
const OWNER: ScoringOwner = { kind: "competitor", id: "22222222-2222-4222-8222-222222222222" };
const SNAPSHOT_CTX = {
  workspaceId: WS,
  contentItemId: "33333333-3333-4333-8333-333333333333",
  collectionRunId: "44444444-4444-4444-8444-444444444444",
  capturedAt: "2026-09-30T12:00:00.000Z",
};

function only(raw: Record<string, unknown>): NormalizedContent {
  const parsed = parseContent([raw]);
  if (parsed.items.length !== 1) throw new Error(`öğe bekleniyordu: ${JSON.stringify(parsed.notItems)}`);
  return parsed.items[0];
}

const CONTENT_KEYS = [
  "caption",
  "coauthors",
  "competitor_id",
  "duration_sec",
  "external_id",
  "format",
  "hashtags",
  "is_paid_partnership",
  "is_pinned",
  "missing_fields",
  "platform",
  "published_at",
  "shortcode",
  "social_account_id",
  "url",
  "workspace_id",
];

describe("toContentRow — açık izin listesi", () => {
  it("videoUrl / ephemeralMediaUrl / transcript / sahip adı ASLA satıra geçmez", () => {
    const item = only(
      reelRow({
        videoUrl: "https://scontent.cdninstagram.example/v/secret-video.mp4?sig=SIRLI-IMZA",
        latestComments: [{ ownerUsername: "yorumcu_kisi", text: "harika" }],
        firstComment: "ilk yorum",
        taggedUsers: [{ username: "etiketli_kisi" }],
        ownerFullName: "Gerçek Ad",
      }),
    );
    // Normalize çıktısı geçici medya adresini taşır (yalnız STT için) — DB satırı taşımamalı.
    expect(item.ephemeralMediaUrl).toContain("secret-video.mp4");

    const row = toContentRow(item, OWNER, WS);
    const snapshot = toSnapshotRow(item, SNAPSHOT_CTX);
    for (const value of [JSON.stringify(row), JSON.stringify(snapshot)]) {
      expect(value).not.toContain("secret-video");
      expect(value).not.toContain("SIRLI-IMZA");
      expect(value).not.toContain("cdninstagram");
      expect(value).not.toContain("yorumcu_kisi");
      expect(value).not.toContain("etiketli_kisi");
      expect(value).not.toContain("ilk yorum");
      expect(value).not.toContain("Gerçek Ad");
    }
    expect(Object.keys(row).sort()).toEqual(CONTENT_KEYS);
    expect(Object.keys(row)).not.toContain("ephemeralMediaUrl");
    expect(Object.keys(row)).not.toContain("transcript");
  });

  it("coauthors: yalnız herkese açık kullanıcı adları yazılır; ad/kimlik/fotoğraf ve yorumcu alanları satıra geçmez; yoksa boş dizi", () => {
    const item = only(
      reelRow({
        inputUrl: "https://www.instagram.com/asil.sahip",
        coauthorProducers: [
          { id: "998877", username: "Ortak.Yazar_1", full_name: "Gizli Tam Ad", profile_pic_url: "https://cdn.example/foto.jpg", is_verified: true },
          { id: "112233", username: "asil.sahip" },
        ],
        latestComments: [{ ownerUsername: "yorumcu_kisi", text: "harika" }],
      }),
    );
    const row = toContentRow(item, OWNER, WS);
    expect(row.coauthors).toEqual(["ortak.yazar_1"]);
    const json = JSON.stringify(row);
    for (const leaked of ["Gizli Tam Ad", "998877", "112233", "foto.jpg", "yorumcu_kisi"]) expect(json).not.toContain(leaked);
    expect(toContentRow(only(reelRow()), OWNER, WS).coauthors).toEqual([]);
    // Dizi kopyadır (normalize çıktısını değiştirmez).
    expect(row.coauthors).not.toBe(item.coauthors);
  });

  it("skor önbelleği sütunları yazılmaz (yeniden toplama mevcut skoru ezmez)", () => {
    const row = toContentRow(only(reelRow()), OWNER, WS);
    for (const column of ["lift", "lift_tier", "baseline_views", "baseline_n", "views_kind", "scored_at", "low_confidence", "cross_score"]) {
      expect(row).not.toHaveProperty(column);
    }
  });

  it("gerçek fixture: 10 reel → 10 satır; alanlar normalize çıktısıyla aynı", () => {
    const parsed = parseContent(loadFixture("reel"));
    const rows = parsed.items.map((item) => toContentRow(item, OWNER, WS));
    expect(rows).toHaveLength(10);
    for (const [i, row] of rows.entries()) {
      const item = parsed.items[i];
      expect(row).toMatchObject({
        workspace_id: WS,
        platform: "instagram",
        external_id: item.externalId,
        shortcode: item.shortcode,
        url: item.url,
        format: "short_video",
        published_at: item.publishedAt,
        caption: item.caption ?? null,
        hashtags: item.hashtags,
        social_account_id: null,
        competitor_id: OWNER.id,
      });
    }
  });

  it("undefined → NULL (0 değil): eksik alanlar null yazılır, anahtarlar hep vardır", () => {
    const item: NormalizedContent = {
      platform: "instagram",
      externalId: "x1",
      format: "carousel",
      hashtags: [],
      metrics: { extra: {} },
      missingFields: ["views"],
    };
    const row = toContentRow(item, { kind: "own", id: "55555555-5555-4555-8555-555555555555" }, WS);
    expect(row).toMatchObject({
      shortcode: null,
      url: null,
      published_at: null,
      caption: null,
      duration_sec: null,
      is_pinned: null,
      is_paid_partnership: null,
      missing_fields: ["views"],
      social_account_id: "55555555-5555-4555-8555-555555555555",
      competitor_id: null,
    });
    expect(Object.keys(row).sort()).toEqual(CONTENT_KEYS);
  });

  it("isPinned: yalnız true ya da NULL; false hiç yazılmaz", () => {
    const base: NormalizedContent = {
      platform: "instagram",
      externalId: "p1",
      format: "short_video",
      hashtags: [],
      metrics: { extra: {} },
      missingFields: [],
    };
    expect(toContentRow({ ...base, isPinned: true }, OWNER, WS).is_pinned).toBe(true);
    expect(toContentRow(base, OWNER, WS).is_pinned).toBeNull();
    // Gerçek fixture'da isPinned her satırda `false`: normalize atar, DB'de NULL kalır.
    for (const item of parseContent(loadFixture("reel")).items) {
      expect(toContentRow(item, OWNER, WS).is_pinned).toBeNull();
    }
    expect(toContentRow(only(reelRow({ isPinned: true })), OWNER, WS).is_pinned).toBe(true);
  });

  it("işbirliği (paidPartnership) bayrağı: false korunur, yoksa NULL", () => {
    expect(toContentRow(only(reelRow({ paidPartnership: false })), OWNER, WS).is_paid_partnership).toBe(false);
    expect(toContentRow(only(reelRow({ paidPartnership: true })), OWNER, WS).is_paid_partnership).toBe(true);
  });
});

describe("toSnapshotRow", () => {
  it("ölçülemeyen metrik NULL, sıfır sıfırdır; views_kind ve extra taşınır", () => {
    const item = only(reelRow({ likesCount: 0, commentsCount: 7, videoPlayCount: 1234, videoViewCount: 99 }));
    const snapshot = toSnapshotRow(item, { ...SNAPSHOT_CTX, ownerFollowers: 1447 });
    expect(snapshot).toMatchObject({
      workspace_id: WS,
      content_item_id: SNAPSHOT_CTX.contentItemId,
      collection_run_id: SNAPSHOT_CTX.collectionRunId,
      captured_at: SNAPSHOT_CTX.capturedAt,
      views: 1234,
      views_kind: "ig_play_count",
      likes: 0, // ölçüldü, sıfır
      comments: 7,
      owner_followers: 1447,
      source: "apify",
      extra: { igViewCount: 99 },
    });
    // Paylaşım/kaydetme/erişim/izlenme süresi bu aktörde ölçülemez → NULL (0 DEĞİL).
    expect(snapshot.shares).toBeNull();
    expect(snapshot.saves).toBeNull();
    expect(snapshot.reach).toBeNull();
    expect(snapshot.avg_watch_sec).toBeNull();
  });

  it("takipçi bilinmiyorsa owner_followers NULL", () => {
    expect(toSnapshotRow(only(reelRow()), SNAPSHOT_CTX).owner_followers).toBeNull();
  });

  it("izlenmesi olmayan içerik (ör. görsel): views/views_kind NULL", () => {
    const image = only(reelRow({ type: "Image", productType: "feed", videoPlayCount: undefined, videoViewCount: undefined, videoUrl: undefined }));
    const snapshot = toSnapshotRow(image, SNAPSHOT_CTX);
    expect(snapshot.views).toBeNull();
    expect(snapshot.views_kind).toBeNull();
  });

  it("gizli beğeni (-1) beğeni sayısı olarak yazılmaz: likes NULL, extra.likesHidden", () => {
    const snapshot = toSnapshotRow(only(reelRow({ likesCount: -1 })), SNAPSHOT_CTX);
    expect(snapshot.likes).toBeNull();
    expect(snapshot.extra).toMatchObject({ likesHidden: true });
  });
});

describe("yardımcılar", () => {
  it("toCount: sonlu ve ≥ 0 tam sayıya yuvarlar; diğer her şey NULL (0 değil)", () => {
    expect(toCount(0)).toBe(0);
    expect(toCount(12.4)).toBe(12);
    for (const bad of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(toCount(bad)).toBeNull();
  });

  it("ownerColumns: kendi hesap XOR rakip", () => {
    expect(ownerColumns({ kind: "own", id: "a" })).toEqual({ social_account_id: "a", competitor_id: null });
    expect(ownerColumns({ kind: "competitor", id: "b" })).toEqual({ social_account_id: null, competitor_id: "b" });
  });
});
