import { describe, expect, it } from "vitest";

import { DEFAULT_ALERT_SETTINGS } from "@/lib/domain/notification";
import { unmeasuredReason } from "@/lib/data/supabase/mappers/baseline";
import { compareCollections, toCountedCollection } from "@/lib/data/supabase/mappers/collections";
import { iso, isoOpt, opt, primitiveRecord, stringList } from "@/lib/data/supabase/mappers/common";
import { toContentItem, toLatestMetrics, toBaselineExplanation, type ContentRow } from "@/lib/data/supabase/mappers/content";
import { analysisStatusOf, competitorStatusOf, liftTierOf, runProviderOf, transcriptSourceOf } from "@/lib/data/supabase/mappers/enums";
import { toAlertColumns, toAlertSettings } from "@/lib/data/supabase/mappers/notifications";
import { toPublishJob, type PublishRow } from "@/lib/data/supabase/mappers/publish";
import { isUsageSettled, toCollectionRun, type RunRow } from "@/lib/data/supabase/mappers/runs";
import { toTranscript } from "@/lib/data/supabase/mappers/intel";

const AT = "2026-09-30T12:00:00.123456+00:00";

const contentRow = (over: Partial<ContentRow> = {}): ContentRow => ({
  id: "c1", workspace_id: "w", platform: "instagram", social_account_id: null, competitor_id: "k1", external_id: "e1", shortcode: null, url: null,
  format: "short_video", published_at: AT, caption: null, hashtags: [], duration_sec: null, is_pinned: null, is_paid_partnership: null,
  missing_fields: [], views_kind: null, baseline_views: null, baseline_n: null, lift: null, lift_tier: null, low_confidence: true, immature: false,
  cross_score: null, first_seen_at: AT, transcripts: null, content_analyses: null, ...over,
});
const owner = { kind: "competitor" as const, id: "k1", handle: "rakip" };

describe("ortak eşleyiciler", () => {
  it("NULL → undefined (0/boş değil); zaman damgaları ISO UTC ms", () => {
    expect([opt(null), opt(0), opt("")]).toEqual([undefined, 0, ""]);
    expect(iso(AT)).toBe("2026-09-30T12:00:00.123Z");
    expect(isoOpt(null)).toBeUndefined();
  });
  it("jsonb alanları güvenli süzülür", () => {
    expect(primitiveRecord({ a: 1, b: "x", c: true, d: { e: 1 }, f: null })).toEqual({ a: 1, b: "x", c: true });
    expect(primitiveRecord(null)).toEqual({});
    expect(primitiveRecord([1])).toEqual({});
    expect(stringList(["a", 1, "b"])).toEqual(["a", "b"]);
    expect(stringList("x")).toEqual([]);
  });
});

describe("enum daraltma", () => {
  it("geçerli değerler geçer, bilinmeyen değer şema uyumsuzluğu hatası verir", () => {
    expect(competitorStatusOf("private")).toBe("private");
    expect(runProviderOf("gemini")).toBe("gemini");
    expect(analysisStatusOf("insufficient_data")).toBe("insufficient_data");
    expect(() => competitorStatusOf("silinmiş")).toThrowError(/Şema\/domain uyumsuzluğu/);
    expect(() => runProviderOf("bilinmeyen")).toThrowError(/koşu sağlayıcısı/);
  });
  it("transcript sağlayıcısı: DB `openai` ↔ domain `openai_stt`", () => {
    expect(transcriptSourceOf("openai")).toBe("openai_stt");
    expect(["apify", "deepgram", "gemini", "manual", "claude_cli"].map(transcriptSourceOf)).toEqual(["apify", "deepgram", "gemini", "manual", "claude_cli"]);
    expect(() => transcriptSourceOf("whisper")).toThrowError();
  });
  it("lift kademesi 0..4; NULL = ölçülemedi (0 değil)", () => {
    expect([liftTierOf(null), liftTierOf(0), liftTierOf(4)]).toEqual([undefined, 0, 4]);
    expect(() => liftTierOf(5)).toThrowError();
  });
});

describe("içerik eşleme", () => {
  it("isPinned: true → true; false ve NULL → undefined; ölçülemeyen metrikler undefined", () => {
    expect(toContentItem(contentRow({ is_pinned: true }), owner, undefined).isPinned).toBe(true);
    expect(toContentItem(contentRow({ is_pinned: false }), owner, undefined).isPinned).toBeUndefined();
    expect(toContentItem(contentRow({ is_pinned: null }), owner, undefined).isPinned).toBeUndefined();
    const item = toContentItem(contentRow({ lift: null, lift_tier: null }), owner, undefined);
    expect([item.score.lift, item.score.liftTier, item.metrics.views, item.metrics.capturedAt]).toEqual([undefined, undefined, undefined, undefined]);
  });
  it("son ölçüm: yalnız ölçülen alanlar dolu (views 0 gerçek ölçümdür); hiç ölçülmemiş (captured_at NULL) → boş metrik", () => {
    const latest = { content_item_id: "c1", captured_at: AT, views: 0, views_kind: "ig_play_count" as const, likes: null, comments: 3, shares: null, saves: null, reach: null, avg_watch_sec: null, extra: { a: 1 } };
    expect(toLatestMetrics(latest)).toMatchObject({ views: 0, viewsKind: "ig_play_count", comments: 3, extra: { a: 1 } });
    expect(toLatestMetrics(latest).likes).toBeUndefined();
    expect(toLatestMetrics({ ...latest, captured_at: null })).toEqual({ extra: {} });
  });
  it("hasTranscript/analysisStatus gömülü ilişkiden (dizi ya da nesne)", () => {
    const item = toContentItem(contentRow({ transcripts: [{ id: "t" }], content_analyses: { status: "ok" } }), owner, undefined);
    expect([item.hasTranscript, item.analysisStatus]).toEqual([true, "ok"]);
    expect(toContentItem(contentRow({ transcripts: [] }), owner, undefined).hasTranscript).toBe(false);
  });
  it("baz çizgisi açıklaması saklananı eşler; eksik sayaçlar 0; sebep yalnız lift NULL iken", () => {
    const measured = toContentItem(contentRow({ lift: 3, lift_tier: 3, baseline_views: 100, baseline_n: 12, low_confidence: false }), owner, undefined);
    const stored = { baseline_excluded: { self: 1, otherFormat: 2, pinned: 0, noViews: 0, differentViewsKind: 0, noDate: 0, tooYoung: 1 }, baseline_basis: [{ contentItemId: "x", views: 90, publishedAt: AT }] };
    const explained = toBaselineExplanation(measured, stored);
    expect([explained.n, explained.lowConfidence, explained.medianViews, explained.excluded.otherFormat, explained.basis.length, explained.unmeasuredReason]).toEqual([12, false, 100, 2, 1, undefined]);
    const empty = toBaselineExplanation(toContentItem(contentRow(), owner, undefined), { baseline_excluded: null, baseline_basis: null });
    expect(empty.excluded).toEqual({ self: 0, otherFormat: 0, pinned: 0, noViews: 0, differentViewsKind: 0, noDate: 0, tooYoung: 0 });
    expect(empty.unmeasuredReason).toBeTruthy();
  });
});

describe("ölçülemedi sebebi", () => {
  const base = { lift: null, format: "short_video" as const, ownerKind: "competitor" as const, n: 5 };
  it("her koşul kendi Türkçe sebebini verir; lift varsa sebep yok", () => {
    expect(unmeasuredReason({ ...base, lift: 3, views: 5 })).toBeUndefined();
    expect(unmeasuredReason({ ...base, format: "carousel" })).toMatch(/karusel/);
    expect(unmeasuredReason({ ...base, ownerKind: "own" })).toMatch(/izlenme ölçülemedi/);
    expect(unmeasuredReason({ ...base, views: 5 })).toMatch(/İzlenme türü bilinmiyor/);
    expect(unmeasuredReason({ ...base, views: 5, viewsKind: "ig_views", n: 0 })).toMatch(/başka içerik yok/);
    expect(unmeasuredReason({ ...base, views: 5, viewsKind: "ig_views", median: 0 })).toMatch(/medyan izlenmesi 0/);
    expect(unmeasuredReason({ ...base, views: 5, viewsKind: "ig_views", median: 10 })).toMatch(/henüz hesaplanmadı/);
  });
});

describe("diğer eşleyiciler", () => {
  it("yayın işi: trial graduation NULL → undefined; sütun adları domain adlarına", () => {
    const row = {
      id: "j", workspace_id: "w", social_account_id: "a", platform: "instagram", idea_id: null, status: "published", caption: "Merhaba", media_path: null, cover_path: null,
      share_to_feed: true, scheduled_at: AT, paid_partnership: false, ai_generated: false, advertiser_name: null, trial_enabled: false, trial_graduation: null,
      attempt_count: 0, approved_by: "u", approved_at: AT, container_id: null, container_expires_at: null, published_external_id: "ext", published_permalink: "https://x",
      last_error: "hata", created_at: AT, updated_at: AT,
    } as PublishRow;
    const job = toPublishJob(row);
    expect([job.trial, job.externalId, job.permalink, job.error, job.scheduledFor, job.ideaId]).toEqual([undefined, "ext", "https://x", "hata", "2026-09-30T12:00:00.123Z", undefined]);
    expect(toPublishJob({ ...row, trial_enabled: false, trial_graduation: "manual" }).trial).toEqual({ enabled: false, graduation: "manual" });
  });
  it("koşu: itemsExpected/itemsIngested adları; actual_usd NULL → undefined (0 değil)", () => {
    const run = toCollectionRun({
      id: "r", workspace_id: "w", provider: "claude_cli", kind: "llm_ideas", status: "succeeded", billing: "subscription", target_label: null, external_run_id: null, reserved_usd: 0, actual_usd: null,
      usage_settled_at: null, price_unknown: false, expected_results: 4, item_count: 3, error: null, started_at: AT, finished_at: null,
    } as RunRow);
    expect([run.actualUsd, run.itemsExpected, run.itemsIngested, run.reservedUsd, run.billing]).toEqual([undefined, 4, 3, 0, "subscription"]);
  });
  it("koşu: Apify geçici actual_usd (usage_settled_at NULL) domain'de görünmez; kesinleşince görünür; LLM API tutarı anında kesin", () => {
    const base = {
      id: "r", workspace_id: "w", provider: "apify", kind: "content", status: "succeeded", billing: "metered", target_label: null, external_run_id: "ap1", reserved_usd: 0.5,
      actual_usd: 0.03, usage_settled_at: null, price_unknown: false, expected_results: 4, item_count: 3, error: null, started_at: AT, finished_at: AT,
    } as RunRow;
    expect(isUsageSettled(base)).toBe(false);
    expect(toCollectionRun(base).actualUsd).toBeUndefined();
    expect(toCollectionRun({ ...base, usage_settled_at: AT }).actualUsd).toBe(0.03);
    expect(toCollectionRun({ ...base, provider: "anthropic", external_run_id: null }).actualUsd).toBe(0.03);
    // 0 gerçek ölçümdür (kesinleşmişse 0 görünür; yalnız kesinleşmemiş/yok = undefined).
    expect(toCollectionRun({ ...base, actual_usd: 0, usage_settled_at: AT }).actualUsd).toBe(0);
    expect(() => toCollectionRun({ ...base, billing: "bedava" })).toThrowError(/faturalama/);
  });
  it("koşu: purpose NULL → undefined (normal iş); 'measurement' ölçüm koşusu; bilinmeyen amaç şema/domain uyumsuzluğu", () => {
    const base = {
      id: "r", workspace_id: "w", provider: "apify", kind: "content", status: "reserved", billing: "metered", purpose: null, target_label: null, external_run_id: null, reserved_usd: 0.03,
      actual_usd: null, usage_settled_at: null, price_unknown: false, expected_results: 4, item_count: null, error: null, started_at: AT, finished_at: null,
    } as RunRow;
    expect(toCollectionRun(base).purpose).toBeUndefined();
    expect(toCollectionRun({ ...base, purpose: "measurement" }).purpose).toBe("measurement");
    expect(() => toCollectionRun({ ...base, purpose: "ozel" })).toThrowError(/koşu amacı/);
  });
  it("transcript: süresi dolmuş/kendi içerik (expires_at NULL) → süresiz; metin NULL → undefined", () => {
    const t = toTranscript({ id: "t", content_item_id: "c", provider: "openai", language: null, text: null, segments: null, word_count: 0, is_meaningful: false, expires_at: null, created_at: AT });
    expect([t.source, t.expiresAt, t.text, t.language, t.segments]).toEqual(["openai_stt", undefined, undefined, undefined, undefined]);
  });
  it("transcript segmentleri: kanal yoksa konuşma; ekran yazısı ayrı; bozuk/boş öğe atılır; süre dolunca (text NULL) segment yok", () => {
    const row = { id: "t", content_item_id: "c", provider: "gemini", language: "en", text: "Hello there", word_count: 2, is_meaningful: false, expires_at: null, created_at: AT };
    const segments = [{ start: 0, end: 1.5, text: "Hello there" }, { start: 2, text: " Comment RENEW ", channel: "screen" }, { start: -1, text: "bozuk" }, { start: 3, text: "  ", channel: "speech" }];
    expect(toTranscript({ ...row, segments }).segments).toEqual([
      { startSec: 0, endSec: 1.5, text: "Hello there", channel: "speech" },
      { startSec: 2, text: "Comment RENEW", channel: "screen" },
    ]);
    expect(toTranscript({ ...row, text: null, segments }).segments).toBeUndefined();
    expect(toTranscript({ ...row, segments: null }).segments).toBeUndefined();
  });
  it("uyarı ayarı: satır yoksa varsayılan (kopya); satırdan ↔ sütunlara gidiş-dönüş; chatIdSet her zaman false", () => {
    const defaults = toAlertSettings(null);
    expect(defaults).toEqual(DEFAULT_ALERT_SETTINGS);
    expect(defaults).not.toBe(DEFAULT_ALERT_SETTINGS);
    const settings = { ...defaults, channels: { inApp: true as const, email: { enabled: true, address: "a@b.co" }, telegram: { enabled: false, chatIdSet: false } } };
    const columns = toAlertColumns(settings);
    expect(columns).toMatchObject({ email_enabled: true, email_address: "a@b.co", telegram_enabled: false, weekly_digest_weekday: 0 });
    expect(toAlertSettings({ workspace_id: "w", ...columns })).toEqual(settings);
    expect(toAlertColumns(defaults).email_address).toBeNull();
  });
  it("koleksiyon: sayaç gömülü sayıdan; sıra = en son güncellenen, sonra ad (Türkçe), sonra id", () => {
    const row = { id: "1", workspace_id: "w", name: "Ab", description: null, created_at: AT, updated_at: AT, collection_items: [{ count: 4 }] };
    expect(toCountedCollection(row).itemCount).toBe(4);
    expect(toCountedCollection({ ...row, collection_items: null }).itemCount).toBe(0);
    const list = [
      { id: "3", name: "b", updated_at: "2026-09-30T12:00:00.5+00:00" },
      { id: "2", name: "a", updated_at: "2026-09-30T12:00:00.5+00:00" },
      { id: "1", name: "z", updated_at: "2026-09-30T12:00:00.500001+00:00" },
      { id: "0", name: "y", updated_at: "2026-09-30T11:59:59+00:00" },
    ];
    expect(list.sort(compareCollections).map((c) => c.id)).toEqual(["1", "2", "3", "0"]);
  });
});
