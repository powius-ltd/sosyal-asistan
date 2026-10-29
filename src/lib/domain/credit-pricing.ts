/**
 * Kredi fiyat tablosu ve saf tahmin (Dilim 1; plan `docs/KREDI-PLAN.md` §4). Şimdilik YALNIZ tahmin: hiçbir yerde kredi düşülmez, bakiye
 * yoktur, iş engellenmez. Fiyatlar birim başınadır (hesap, video, plan, soru): token'a göre değil; kullanıcı işi başlatmadan fiyatı bilir.
 *
 * Kurallar:
 *  - Fiyat tablosu burada, sürümlü: bir fiyat değişirse `CREDIT_PRICE_VERSION` artar (testli deploy; defter satırları sürümü saklayacak).
 *  - Tahmin "EN ÇOK" demektir (koşmayabilecek adımlar koşacakmış gibi sayılır). Birim sayısı bilinmiyorsa tahmin `undefined`'dır (0 değil).
 *  - Stüdyo videosu geçicidir (`PROVISIONAL_CREDIT_ITEMS`): maliyet ölçülünce sabitlenir.
 * Saf dosya (sunucu + istemci). Müşteriye söylenen metin `plain-language.ts`'tedir.
 */
import type { JobKind } from "@/lib/domain/panel-job";

/** Fiyat tablosunun sürümü; herhangi bir kredi fiyatı değiştiğinde artar. */
export const CREDIT_PRICE_VERSION = "2026-10-12";

/** Fiyatlanan kalemler (plan §4 tablosu). */
export const CREDIT_ITEMS = ["account_scan", "video_review", "weekly_plan", "briefing", "chat_question", "measurement", "studio_video"] as const;
export type CreditItem = (typeof CREDIT_ITEMS)[number];

/**
 * Birim başına kredi. 1 kredi ≈ $0,01 maliyet (iç kural, müşteriye söylenmez).
 *  - account_scan: hesap tarama (25 Reels + profil), hesap başına · video_review: video inceleme (≤ 3 dk; transcript, konu eleği ve açı
 *    etiketi dahil), video başına · weekly_plan: haftalık plan (kümeleme, sentez, fikir + script) · briefing: notlar · chat_question: sohbet
 *    sorusu · measurement: ölçüm koşusu (kendi hesap, 10 Reels) · studio_video: stüdyo videosu.
 */
export const CREDIT_UNIT_PRICES: Record<CreditItem, number> = {
  account_scan: 8,
  video_review: 10,
  weekly_plan: 60,
  briefing: 4,
  chat_question: 3,
  measurement: 4,
  studio_video: 400,
};

/** Fiyatı henüz geçici olan kalemler (gerçek maliyet ölçülünce sabitlenir). */
export const PROVISIONAL_CREDIT_ITEMS: readonly CreditItem[] = ["studio_video"];

/**
 * Tahmin için gereken birim sayıları. Alan yok = bilinmiyor (0 değil). `type` takma adıdır: `panel_jobs.result` jsonb'sine yazılan şekil
 * (`JobEstimate.units`) `Json` tipine atanabilsin.
 */
export type CreditUnits = {
  /** Taranacak hesap sayısı (kendi + izlenen rakipler). */
  accounts?: number;
  /** İncelenecek video sayısı. */
  videos?: number;
  /** Ölçülecek kendi hesap sayısı (ölçüm koşusu hesap başınadır). */
  measureRuns?: number;
};

/** Tahmin dökümünün bir satırı: kalem × birim sayısı × birim fiyat. */
export interface CreditEstimateLine {
  item: CreditItem;
  units: number;
  creditsPerUnit: number;
  credits: number;
  /** Birim fiyat geçici mi (`PROVISIONAL_CREDIT_ITEMS`). */
  provisional: boolean;
}

export interface CreditEstimate {
  /** EN ÇOK harcanacak kredi (tam sayı). */
  maxCredits: number;
  /** Döküm; birim sayısı 0 olan kalem yazılmaz. Boş liste = ek kredi yok. */
  lines: CreditEstimateLine[];
  priceVersion: string;
  /** Döküm geçici fiyatlı bir kalem içeriyor. */
  provisional: boolean;
}

/** Bir iş türünün hangi kalemleri, hangi birim sayısıyla tükettiği. `fixed` = sayı sabit (1); `units` = tahmin girdisinden gelir. */
type Source = { item: CreditItem; fixed: number } | { item: CreditItem; units: keyof CreditUnits };

/**
 * İş türü → kalemler. Açı etiketlemesi video incelemesinin içindedir (ayrı kredi yok, plan §4); haftalık plan ve notlar "en çok" varsayımıyla
 * her turda bir kez sayılır (plan zaten varsa ya da notlar tazeyse adım atlanır, gerçek düşüm daha az olur).
 */
const JOB_CREDIT_SOURCES: Record<JobKind, readonly Source[]> = {
  collect: [{ item: "account_scan", units: "accounts" }],
  measure: [{ item: "measurement", units: "measureRuns" }],
  analyze: [{ item: "video_review", units: "videos" }],
  label: [],
  plan: [{ item: "weekly_plan", fixed: 1 }],
  briefing: [{ item: "briefing", fixed: 1 }],
  routine: [
    { item: "account_scan", units: "accounts" },
    { item: "video_review", units: "videos" },
    { item: "weekly_plan", fixed: 1 },
    { item: "measurement", units: "measureRuns" },
    { item: "briefing", fixed: 1 },
  ],
  // Halka uçları: Zernio ölçümü resmi API'den okur (kredi yok); keşif aday aramasıdır, hesap taraması kalemiyle sayılır.
  measure_zernio: [],
  order: [],
  order_return: [],
  publish: [],
  ads_sync: [],
  produce: [],
  discover: [{ item: "account_scan", units: "accounts" }],
  // Başlangıç (ilk tur) dökümü; ayrılan tutar birimlerden değil aşamanın sabit tavanından gelir (`job-credits.ts`).
  onboarding: [
    { item: "account_scan", units: "accounts" },
    { item: "video_review", units: "videos" },
    { item: "weekly_plan", fixed: 1 },
    { item: "briefing", fixed: 1 },
  ],
};

const isCount = (value: number | undefined): value is number => value !== undefined && Number.isInteger(value) && value >= 0;

/** Bir kalemin kredisi: `units × birim fiyat`. Geçersiz sayı (negatif, kesirli, sonlu değil) → undefined. */
export function creditsFor(item: CreditItem, units: number): number | undefined {
  return isCount(units) ? units * CREDIT_UNIT_PRICES[item] : undefined;
}

/**
 * İşin en çok kaç kredi tutacağı. Türün gerektirdiği birim sayılarından BİRİ bile bilinmiyorsa (ya da geçersizse) `undefined`: kısmi toplam
 * "en çok" olamaz. Kredi harcamayan tür (`label`) 0 kredi ve boş dökümle döner (bilinen sıfır).
 */
export function estimateJobCredits(kind: JobKind, units: CreditUnits = {}): CreditEstimate | undefined {
  const lines: CreditEstimateLine[] = [];
  for (const source of JOB_CREDIT_SOURCES[kind]) {
    const count = "fixed" in source ? source.fixed : units[source.units];
    if (!isCount(count)) return undefined;
    if (count === 0) continue;
    const creditsPerUnit = CREDIT_UNIT_PRICES[source.item];
    lines.push({ item: source.item, units: count, creditsPerUnit, credits: count * creditsPerUnit, provisional: PROVISIONAL_CREDIT_ITEMS.includes(source.item) });
  }
  return {
    maxCredits: lines.reduce((sum, line) => sum + line.credits, 0),
    lines,
    priceVersion: CREDIT_PRICE_VERSION,
    provisional: lines.some((line) => line.provisional),
  };
}
