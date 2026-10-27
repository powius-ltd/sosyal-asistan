/**
 * Mock üreteci: 30 paralı koşu (son ~80 gün) + 4 abonelik koşusu (agy/Gemini, Claude CLI). Apify çoğunlukta; birkaç
 * Claude (anthropic) ve bir STT (deepgram) koşusu. Kenar durumları: başarısız, zaman aşımı, iptal, fiyatı okunamayan
 * (`priceUnknown`) ve mutabakatı yapılmamış (`actualUsd` undefined — 0 DEĞİL) koşular.
 *
 * Tutarlar: rezerve = beklenen öğe × birim fiyat × 1,2 (tampon); gerçek = işlenen öğe × birim fiyat.
 * Eylül ayı Apify harcaması ~$4-5 (tavan $10).
 */
import type { CollectionRun, RunBilling, RunKind, RunProvider, RunStatus } from "@/lib/domain/run";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import { DAY_MS } from "@/lib/time";
import type { Rng } from "@/lib/data/mock/prng";

/** Birim fiyat (USD / öğe). */
const UNIT_PRICE: Partial<Record<RunKind, number>> = {
  content: 0.0052, // reel scraper + includeTranscript
  profile: 0.0026,
  discovery_related: 0.0026,
  discovery_search: 0.0023,
  llm_analysis: 0.0075,
  llm_ideas: 0.024,
  transcription: 0.0045,
};
const TIKTOK_CONTENT_PRICE = 0.004;
const RESERVE_BUFFER = 1.2;

interface RunSpec {
  provider: RunProvider;
  kind: RunKind;
  status: RunStatus;
  target: string;
  age: number;
  expected: number;
  /** İşlenen öğe; undefined = henüz işlenmedi. */
  ingested?: number;
  /** false = mutabakat yok (actualUsd undefined). Varsayılan: bitmiş koşularda true. */
  reconciled?: boolean;
  /** Gerçek tutarı sabitle (ör. 404'te ücret 0). */
  actualOverride?: number;
  priceUnknown?: boolean;
  unitPrice?: number;
  error?: string;
  minutes?: number;
  /** Varsayılan "metered"; abonelik koşusunda tutar yoktur (rezerve 0, actualUsd undefined). */
  billing?: RunBilling;
  /** [giriş, çıkış] token; yoksa kaydedilmedi (örn. model çağrısına varamayan koşu). */
  tokens?: readonly [input: number, output: number];
  /** Çağrının modeli; yoksa kaydedilmedi (gölge maliyet sağlayıcı varsayımına düşer). */
  model?: string;
}

const SPECS: RunSpec[] = [
  // ---- Temmuz
  { provider: "apify", kind: "content", status: "ingested", target: "@girisimci.ai", age: 80, expected: 50, ingested: 48 },
  { provider: "apify", kind: "profile", status: "ingested", target: "6 profil", age: 75, expected: 6, ingested: 6 },
  { provider: "apify", kind: "content", status: "ingested", target: "@excelhoca.ai", age: 70, expected: 50, ingested: 50 },
  { provider: "apify", kind: "content", status: "aborted", target: "@otomasyoncu", age: 65, expected: 50, ingested: 9, actualOverride: 0.05, error: "Kullanıcı koşuyu iptal etti." },
  // ---- Ağustos
  { provider: "apify", kind: "content", status: "ingested", target: "@notionlu.hayat", age: 57, expected: 40, ingested: 38 },
  { provider: "apify", kind: "discovery_search", status: "ingested", target: '"yapay zeka verimlilik" araması', age: 45, expected: 120, ingested: 112, priceUnknown: true },
  { provider: "apify", kind: "content", status: "ingested", target: "@yapayzekaofis", age: 40, expected: 60, ingested: 59 },
  { provider: "apify", kind: "content", status: "ingested", target: "@promptustasi", age: 38, expected: 60, ingested: 55 },
  { provider: "anthropic", kind: "llm_analysis", status: "ingested", target: "12 içerik analizi", age: 35, expected: 12, ingested: 12 },
  // ---- Eylül
  { provider: "apify", kind: "content", status: "ingested", target: "@yapayzekaofis", age: 13, expected: 60, ingested: 58 },
  { provider: "apify", kind: "content", status: "failed", target: "@aiilekazan", age: 12, expected: 30, ingested: 0, actualOverride: 0, error: "Profil bulunamadı (404): hesap silinmiş ya da kullanıcı adı yanlış." },
  { provider: "apify", kind: "content", status: "ingested", target: "@promptustasi", age: 12, expected: 60, ingested: 57 },
  { provider: "apify", kind: "content", status: "ingested", target: "@excelhoca.ai", age: 11, expected: 50, ingested: 50 },
  { provider: "apify", kind: "content", status: "ingested", target: "@otomasyoncu", age: 10, expected: 50, ingested: 48 },
  { provider: "apify", kind: "content", status: "ingested", target: "@verimlikafa", age: 9, expected: 40, ingested: 40 },
  { provider: "anthropic", kind: "llm_analysis", status: "ingested", target: "14 içerik analizi", age: 9, expected: 14, ingested: 14 },
  { provider: "apify", kind: "content", status: "timed_out", target: "@girisimci.ai", age: 8, expected: 50, reconciled: false, error: "Aktör 300 sn içinde bitmedi (zaman aşımı).", minutes: 5 },
  { provider: "apify", kind: "content", status: "ingested", target: "@girisimci.ai", age: 7.9, expected: 50, ingested: 47 },
  { provider: "apify", kind: "profile", status: "ingested", target: "9 profil", age: 6, expected: 9, ingested: 9 },
  { provider: "deepgram", kind: "transcription", status: "ingested", target: "6 video (Deepgram)", age: 6, expected: 6, ingested: 6 },
  { provider: "apify", kind: "discovery_related", status: "ingested", target: "@otomasyoncu ilgili hesaplar", age: 5, expected: 40, ingested: 36 },
  { provider: "apify", kind: "profile", status: "ingested", target: "3 aday profil", age: 4.5, expected: 3, ingested: 3 },
  { provider: "apify", kind: "discovery_search", status: "ingested", target: '"chatgpt ile iş" araması', age: 4, expected: 150, ingested: 142 },
  { provider: "apify", kind: "discovery_related", status: "failed", target: "@yapayzekaofis ilgili hesaplar", age: 3, expected: 40, ingested: 0, reconciled: false, priceUnknown: true, error: "Aktör beklenmedik biçimde döndü (0 öğe)." },
  { provider: "anthropic", kind: "llm_analysis", status: "failed", target: "10 içerik analizi", age: 3, expected: 10, ingested: 0, actualOverride: 0.031, error: "Model yanıtı şemaya uymadı (2 deneme)." },
  { provider: "apify", kind: "content", status: "ingested", target: "@verimlilab · TikTok", age: 2, expected: 30, ingested: 30, unitPrice: TIKTOK_CONTENT_PRICE },
  { provider: "anthropic", kind: "llm_ideas", status: "ingested", target: "5 fikir kartı", age: 2, expected: 5, ingested: 5 },
  { provider: "apify", kind: "content", status: "succeeded", target: "@excelhoca.ai", age: 0.3, expected: 50, reconciled: false },
  { provider: "apify", kind: "content", status: "running", target: "@yapayzekaofis", age: 0.02, expected: 60 },
  { provider: "apify", kind: "content", status: "reserved", target: "@promptustasi", age: 0.001, expected: 60 },
  // ---- Abonelik (Faz 2): agy/Gemini video analizi ve Claude CLI görevleri. Tutar yok (actualUsd undefined, 0 değil).
  { provider: "gemini", kind: "video_analysis", status: "ingested", target: "agy · 6 video analizi", age: 1.5, expected: 6, ingested: 6, billing: "subscription", tokens: [183_048, 139_680], model: "gemini-3.8-flash-medium" },
  { provider: "gemini", kind: "video_analysis", status: "failed", target: "agy · 1 video (kota)", age: 1.4, expected: 1, ingested: 0, billing: "subscription", error: "agy 429: kota doldu (8 sn sonra yeniden denenecek)." },
  { provider: "claude_cli", kind: "llm_voice_profile", status: "ingested", target: "Claude CLI · ses profili", age: 1, expected: 1, ingested: 1, billing: "subscription", tokens: [18_288, 5_023] },
  { provider: "claude_cli", kind: "llm_week_synthesis", status: "ingested", target: "Claude CLI · haftalık plan", age: 0.9, expected: 1, ingested: 1, billing: "subscription", tokens: [12_027, 2_308], model: "claude-sonnet-5-5" },
];

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;
const FINISHED: readonly RunStatus[] = ["succeeded", "ingested", "failed", "aborted", "timed_out"];

export function buildRuns(rng: Rng, clock: MockClock): CollectionRun[] {
  return SPECS.map((spec, i) => {
    const billing: RunBilling = spec.billing ?? "metered";
    const unit = spec.unitPrice ?? UNIT_PRICE[spec.kind] ?? 0.005;
    const reservedUsd = billing === "subscription" ? 0 : round4(spec.expected * unit * RESERVE_BUFFER * (spec.priceUnknown ? 1.5 : 1));
    const finished = FINISHED.includes(spec.status);
    const reconciled = billing === "metered" && finished && spec.reconciled !== false && spec.ingested !== undefined;
    const actualUsd = reconciled
      ? spec.actualOverride ?? round4((spec.ingested ?? 0) * unit * rng.float(0.92, 1.02))
      : undefined;
    const startedMs = clock.nowMs - spec.age * DAY_MS;
    const minutes = spec.minutes ?? rng.float(0.8, 4);

    return {
      id: `run_${String(i + 1).padStart(2, "0")}`,
      workspaceId: WS,
      provider: spec.provider,
      kind: spec.kind,
      status: spec.status,
      billing,
      targetLabel: spec.target,
      externalRunId:
        spec.provider === "apify" && spec.status !== "reserved"
          ? Array.from({ length: 17 }, () => rng.pick([..."ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"])).join("")
          : undefined,
      reservedUsd,
      actualUsd,
      priceUnknown: spec.priceUnknown ?? false,
      itemsExpected: spec.expected,
      itemsIngested: spec.ingested,
      ...(spec.tokens === undefined ? {} : { inputTokens: spec.tokens[0], outputTokens: spec.tokens[1] }),
      ...(spec.model === undefined ? {} : { model: spec.model }),
      error: spec.error,
      startedAt: new Date(startedMs).toISOString(),
      finishedAt: finished ? new Date(startedMs + minutes * 60_000).toISOString() : undefined,
    };
  });
}
