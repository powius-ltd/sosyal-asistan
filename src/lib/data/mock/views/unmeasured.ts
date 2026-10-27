/**
 * Mock görünümü: "Ölçülemeyenler" listesi. Kaynaklar:
 *  - resmi API'ye bağlı olmayan kendi hesaplar (social_accounts.connection)
 *  - gizli / bulunamayan rakipler ve profilde eksik alanlar (competitors.status / missing_fields)
 *  - içerik metriklerinde eksik alanlar — hesap + alan başına TEK satır (300 içerik × alan
 *    listeyi boğmasın diye gruplanır; tek içerikse refId o içeriktir)
 *  - başarısız / zaman aşımı / iptal koşular, fiyatı okunamayan ve mutabakatı bekleyen koşular
 */
import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import type { ContentItem } from "@/lib/domain/content";
import type { UnmeasuredEntry } from "@/lib/domain/measured";
import { PLATFORM_LABEL } from "@/lib/domain/platform";
import type { CollectionRun } from "@/lib/domain/run";

const FIELD_REASON_COMPETITOR: Record<string, string> = {
  views: "Instagram karusel ve görsel gönderilerde herkese açık izlenme sayısı vermiyor.",
  likes: "Hesap sahibi beğeni sayısını gizlemiş.",
  shares: "Paylaşım sayısı herkese açık veride yok; yalnız hesap sahibi resmi API ile görür.",
  saves: "Kaydetme sayısı herkese açık veride yok; yalnız hesap sahibi resmi API ile görür.",
  reach: "Erişim herkese açık veride yok; yalnız hesap sahibi resmi API ile görür.",
  avgWatchSec: "Ortalama izlenme süresi herkese açık veride yok; yalnız hesap sahibi resmi API ile görür.",
};

function contentReason(item: ContentItem, field: string, connected: boolean): string {
  if (item.owner.kind === "competitor") return FIELD_REASON_COMPETITOR[field] ?? "Platform bu alanı döndürmedi.";
  if (!connected) return "Hesap resmi API'ye bağlı değil; bu alan yalnız hesap içgörülerinde var.";
  if (field === "reach" || field === "avgWatchSec") {
    return "İçgörü henüz hazır değil (Meta bu değerleri 48 saate kadar geciktirebilir).";
  }
  return "Resmi API bu içerik için değer döndürmedi.";
}

function contentRows(items: ContentItem[], own: OwnAccount[]): UnmeasuredEntry[] {
  const groups = new Map<string, ContentItem[]>();
  for (const c of items) {
    for (const field of c.missingFields) {
      const key = `${c.owner.kind}|${c.owner.id}|${field}`;
      const group = groups.get(key);
      if (group) group.push(c);
      else groups.set(key, [c]);
    }
  }
  const rows: UnmeasuredEntry[] = [];
  for (const [key, group] of groups) {
    const field = key.split("|")[2];
    const first = group[0];
    const connected = own.find((a) => a.id === first.owner.id)?.connection === "connected";
    const seenAt = group.map((c) => c.metrics.capturedAt).filter((v): v is string => v !== undefined).sort().at(-1);
    rows.push({
      scope: "content",
      subject:
        group.length === 1
          ? `@${first.owner.handle} · ${first.shortcode ?? first.externalId}`
          : `@${first.owner.handle} · ${group.length} içerik`,
      refId: group.length === 1 ? first.id : undefined,
      platform: first.platform,
      field,
      reason: contentReason(first, field, connected),
      source: "content_items.missing_fields",
      seenAt,
    });
  }
  return rows;
}

function accountRows(own: OwnAccount[]): UnmeasuredEntry[] {
  return own
    .filter((a) => a.connection !== "connected")
    .map((a) => ({
      scope: "account" as const,
      subject: `@${a.handle} · ${PLATFORM_LABEL[a.platform]}`,
      refId: a.id,
      platform: a.platform,
      reason:
        a.connection === "scrape_only"
          ? "Resmi API bağlı değil: erişim, izlenme süresi ve kitle içgörüleri ölçülemiyor; yalnız herkese açık sayılar toplanıyor."
          : "Bağlantının süresi doldu ya da erişim geri alındı; yeniden bağlanana kadar içgörüler güncellenmiyor.",
      source: "social_accounts.connection",
      seenAt: a.lastSyncedAt,
    }));
}

function competitorRows(competitors: Competitor[]): UnmeasuredEntry[] {
  const rows: UnmeasuredEntry[] = [];
  for (const c of competitors) {
    if (c.status === "private" || c.status === "not_found") {
      rows.push({
        scope: "competitor",
        subject: `@${c.handle}`,
        refId: c.id,
        platform: c.platform,
        reason:
          c.status === "private"
            ? "Hesap gizli: herkese açık içerik verisi alınamıyor."
            : "Hesap bulunamadı (silinmiş ya da kullanıcı adı yanlış).",
        source: "competitors.status",
        seenAt: c.lastCollectedAt ?? c.addedAt,
      });
    }
    for (const field of c.missingFields) {
      rows.push({
        scope: "competitor",
        subject: `@${c.handle}`,
        refId: c.id,
        platform: c.platform,
        field,
        reason: c.status === "candidate" ? "Aday profili henüz tam toplanmadı." : "Profil verisinde bu alan yok.",
        source: "competitors.missing_fields",
        seenAt: c.lastCollectedAt ?? c.addedAt,
      });
    }
  }
  return rows;
}

function runRows(runs: CollectionRun[]): UnmeasuredEntry[] {
  const rows: UnmeasuredEntry[] = [];
  for (const r of runs) {
    const subject = `${r.provider} · ${r.targetLabel ?? r.kind}`;
    const seenAt = r.finishedAt ?? r.startedAt;
    if (r.status === "failed" || r.status === "timed_out" || r.status === "aborted") {
      rows.push({ scope: "source", subject, refId: r.id, reason: r.error ?? "Koşu tamamlanamadı.", source: "collection_runs.error", seenAt });
    }
    if (r.priceUnknown) {
      rows.push({
        scope: "source",
        subject,
        refId: r.id,
        field: "cost",
        reason: "Aktör fiyatı okunamadı; rezerve tutar muhafazakâr bir tahmin, gerçek tutar mutabakatta netleşecek.",
        source: "collection_runs.price_unknown",
        seenAt,
      });
    } else if (r.billing === "metered" && (r.status === "succeeded" || r.status === "ingested") && r.actualUsd === undefined) {
      // Abonelik koşusunda tutar hiç yoktur (mutabakat konusu değil): yalnız kullanıma göre ücretli koşular.
      rows.push({
        scope: "source",
        subject,
        refId: r.id,
        field: "actualUsd",
        reason: "Gerçek tutar henüz mutabık değil (bilinmiyor, 0 değil).",
        source: "collection_runs.actual_usd",
        seenAt,
      });
    }
  }
  return rows;
}

export function buildUnmeasured(
  own: OwnAccount[],
  competitors: Competitor[],
  items: ContentItem[],
  runs: CollectionRun[],
): UnmeasuredEntry[] {
  return [...accountRows(own), ...competitorRows(competitors), ...contentRows(items, own), ...runRows(runs)];
}
