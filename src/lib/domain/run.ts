/**
 * Paralı çağrı koşuları, maliyet özeti ve workspace.
 * Tablolar: `collection_runs` (Apify + LLM + STT her paralı çağrı), `workspaces`.
 *
 * Bütçe: `reserve_budget()` RPC koşu başlamadan tutar rezerve eder; ay toplamı
 * `greatest(actual, reserved)` ile hesaplanır; tavan aşılırsa koşu HİÇ başlamaz.
 * `actualUsd === undefined` = mutabakat yapılmadı (henüz gerçek tutar bilinmiyor) — 0 DEĞİL.
 */
import type { AccountType } from "@/lib/domain/account-type";
import type { ComplianceRegion } from "@/lib/domain/compliance";
import type { ContentLanguage } from "@/lib/domain/content-language";
import type { CollectionKind } from "@/lib/platforms/types";

/**
 * `collection_runs.provider` değerleri (DB check ile birebir). Ücretsiz sağlayıcılar (`graph_api`, `claude_cli`,
 * `gemini` abonelik) da koşu olarak izlenir; tavan gruplaması `reserve_budget()`'tadır (apify ↔ diğerleri).
 */
export type RunProvider = "apify" | "anthropic" | "deepgram" | "openai" | "graph_api" | "claude_cli" | "gemini";

/**
 * Toplama türleri + LLM/STT işleri. Faz 2: `video_analysis` (agy/Gemini video analizi) ve plan görevleri
 * (`llm_topic_screen` konu eleği, `llm_voice_profile` ses profili, `llm_topic_cluster` kümeleme, `llm_week_synthesis` plan
 * gerekçesi, `llm_idea_generation` fikir + script, `llm_angle_label` Kreatif Matris açı/katman etiketi, `llm_briefing` Analist
 * brifingi, `llm_chat` sohbet kutusu yanıtı). DB yalnız biçimi doğrular (`^[a-z][a-z0-9_]{1,40}$`).
 */
export type RunKind =
  | CollectionKind
  | "llm_analysis"
  | "llm_ideas"
  | "transcription"
  | "video_analysis"
  | "llm_topic_screen"
  | "llm_voice_profile"
  | "llm_topic_cluster"
  | "llm_week_synthesis"
  | "llm_idea_generation"
  | "llm_angle_label"
  | "llm_briefing"
  | "llm_chat"
  | "llm_director";

/**
 * Faturalama biçimi: `metered` = kullanıma göre ücretli (Apify, LLM API; `actualUsd` mutabakatla dolar) · `subscription` =
 * abonelik (agy/Gemini CLI, Claude CLI): tutar yoktur (`actualUsd` undefined, 0 DEĞİL), yalnız çağrı sayısı sayılır.
 */
export type RunBilling = "metered" | "subscription";

export const RUN_BILLINGS: readonly RunBilling[] = ["metered", "subscription"];

/**
 * Koşunun amacı (`collection_runs.purpose`): `measurement` = ölçüm koşusu (Reels D+1/3/7 ölçümü; aylık ölçüm tavanına sayılır).
 * undefined = normal toplama/LLM işi.
 */
export type RunPurpose = "measurement";

export const RUN_PURPOSES: readonly RunPurpose[] = ["measurement"];

/**
 * reserved: bütçe tutuldu · running: sağlayıcıda çalışıyor · succeeded: sağlayıcı bitti, veri
 * henüz işlenmedi · ingested: veri DB'ye yazıldı · failed: hata · aborted: iptal · timed_out: zaman aşımı.
 */
export type RunStatus =
  | "reserved"
  | "running"
  | "succeeded"
  | "ingested"
  | "failed"
  | "aborted"
  | "timed_out";

export const RUN_STATUSES: readonly RunStatus[] = [
  "reserved",
  "running",
  "succeeded",
  "ingested",
  "failed",
  "aborted",
  "timed_out",
];

export interface CollectionRun {
  id: string;
  workspaceId: string;
  provider: RunProvider;
  kind: RunKind;
  status: RunStatus;
  /** Faturalama biçimi (abonelik koşusunda tutar yoktur). */
  billing: RunBilling;
  /** Amaç; ölçüm koşusu `measurement`, normal iş undefined. */
  purpose?: RunPurpose;
  /** Ne toplandı: "@kahvecininyeri" ya da "kahve arama sorgusu". */
  targetLabel?: string;
  /** Sağlayıcı tarafındaki koşu id'si (Apify run id). */
  externalRunId?: string;
  /**
   * LLM çağrısının token sayıları (Claude CLI ve agy/Gemini yazar; Apify yazmaz). undefined = kaydedilmedi (0 değil). Abonelik
   * koşusunda "API'de tutardı" gölge maliyeti bunlardan okuma anında hesaplanır (`domain/provider-pricing.ts`).
   */
  inputTokens?: number;
  outputTokens?: number;
  /**
   * Çağrının modeli (Claude CLI zarfının bildirdiği ad, agy'de yapılandırılan ad). undefined = kaydedilmedi (eski koşu ya da model çağrısına
   * varamayan koşu): gölge maliyet sağlayıcı varsayımına düşer.
   */
  model?: string;
  /** Koşuyu açan panel işi (iş başına alınan kredi ↔ gerçek USD raporu). undefined = işe bağlı değil. */
  panelJobId?: string;
  /** Başlamadan tutulan üst sınır tahmin (USD). */
  reservedUsd: number;
  /**
   * Gerçek tutar (KESİNLEŞMİŞ mutabakat sonrası). undefined = mutabakat yok/bekliyor ya da abonelik koşusu, 0 değil.
   * Apify kullanımı koşu bittikten sonra kademeli işlenir: geçici (henüz kesinleşmemiş) tutar burada görünmez.
   */
  actualUsd?: number;
  /** Sağlayıcı fiyatı okunamadı; rezerve tutar muhafazakâr tahmindir. */
  priceUnknown: boolean;
  itemsExpected?: number;
  itemsIngested?: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

/** Bir sağlayıcı grubunun ay içi harcaması. */
export interface CostBucket {
  /** Aylık tavan (USD). undefined = tavan tanımlı değil. */
  capUsd?: number;
  /** Σ greatest(actual, reserved) — tavana karşı sayılan tutar. */
  committedUsd: number;
  /** Yalnız mutabık (actual bilinen) koşuların toplamı. */
  actualUsd: number;
  runs: number;
  /** actualUsd'si henüz bilinmeyen koşu sayısı. */
  unreconciledRuns: number;
  priceUnknownRuns: number;
}

/** Abonelik koşularının "API'de tutardı" toplamı (okuma anında hesaplanır; DB'ye yazılmaz, tavana girmez). */
export interface ShadowApiCost {
  /** Token'ı bilinen koşuların API liste fiyatıyla toplamı (USD). Hiç koşunun fiyatı hesaplanamadıysa undefined (0 değil). */
  usd?: number;
  /** Fiyatı hesaplanan koşu sayısı. */
  pricedRuns: number;
  /** Fiyatı hesaplanamayan koşu sayısı (token kaydı eksik YA DA modeli / kullanımı fiyat tablosunda yok). */
  unpricedRuns: number;
  /** Bunlardan token'ı kayıtlı olup modeli (ya da kullanımı) fiyat tablosunda OLMAYANLAR; kalanı (`unpricedRuns − unlistedRuns`) token'sızdır. */
  unlistedRuns: number;
  /** Hesapta kullanılan fiyat tablosu sürümü (`PROVIDER_PRICE_VERSION`). */
  priceVersion: string;
}

/** Abonelik (tutarsız) çağrı sayaçları: "Abonelik: N agy / M Claude çağrısı". Tutara ve tavana girmez. */
export interface SubscriptionUsage {
  /** Ay içindeki abonelik koşusu sayısı. */
  runs: number;
  /** Sağlayıcıya göre koşu sayısı (`gemini` = agy/Gemini, `claude_cli` = Claude CLI); hiç koşu olmayan sağlayıcı yok. */
  byProvider: Partial<Record<RunProvider, number>>;
  /** Bu koşular API fiyatıyla ne tutardı (yalnız yönetici ekranı okur). `pricedRuns + unpricedRuns = runs`. */
  shadow: ShadowApiCost;
}

export interface CostSummary {
  /** "YYYY-MM" (workspace saat diliminde). */
  month: string;
  /** Apify koşuları. */
  apify: CostBucket;
  /** Claude + STT sağlayıcıları (yalnız kullanıma göre ücretli koşular; abonelik `subscription`'dadır). */
  llm: CostBucket;
  /** Abonelik koşuları (tutar yok, yalnız çağrı sayısı). */
  subscription: SubscriptionUsage;
  totalCommittedUsd: number;
}

export interface Workspace {
  id: string;
  name: string;
  /** IANA saat dilimi; tarih/gün sınırları bununla hesaplanır. */
  timezone: string;
  /**
   * Hedef kitlenin saat dilimi (ör. "America/New_York"): paylaşım saati analizi ve haftalık plan takvimi bununla hesaplanır.
   * DB'de `audience_timezone` boşsa (NULL) `timezone` kullanılır — bu alan HER ZAMAN doludur.
   */
  audienceTimeZone: string;
  /** Niş özeti: konu eleği ve fikir üretimi bunu kullanır. */
  nicheBrief?: string;
  apifyMonthlyCapUsd?: number;
  llmMonthlyCapUsd?: number;
  /**
   * Aylık ÖLÇÜM tavanı (USD; yalnız `purpose = measurement` koşuları sayar). undefined = ONAYSIZ: kullanıcı onaylayana kadar ölçüm
   * harcaması yapılamaz (0 değil: 0 "ölçüm kapalı" demektir, onaylı). Tek seferlik `--max-usd` ayrı yoldur. Genel Apify tavanı
   * (`apifyMonthlyCapUsd`) bunun üstünde aynen geçerlidir. Yalnız `updateWorkspace` ile (onay kararı) set edilir.
   */
  measureMonthlyCapUsd?: number;
  /** Ölçüm tavanının onaylandığı an; `measureMonthlyCapUsd` ile birlikte dolu/boştur. */
  measureCapApprovedAt?: string;
  /**
   * Aylık AJAN tavanı (USD): yönetici ajan bu tavan içinde toplama ve rakip bulmayı kendisi açar. undefined = ONAYSIZ (ajan para harcayamaz);
   * 0 = onaylı ama kapalı. Tavanı vermek onaydır (`agentCapApprovedAt`). Yeni hesaba `AGENT_DEFAULT_CAP_USD` yazılır; mevcut hesaplar onaysız kalır.
   */
  agentMonthlyCapUsd?: number;
  /** Ajan tavanının onaylandığı an; `agentMonthlyCapUsd` ile birlikte dolu/boştur. */
  agentCapApprovedAt?: string;
  /** Toplama sıklığı (gün, 1–60; varsayılan 14). Alan yoksa `agentSettingsOf` varsayılanı verir. */
  collectEveryDays?: number;
  /** Toplamada hesap başına son kaç video (5–50; varsayılan 25). */
  collectVideoLimit?: number;
  /** Hedef izlenen rakip sayısı (0–10; varsayılan 3). */
  rivalTarget?: number;
  /**
   * Yayın uyum bölgesi: açıklama denetimi hangi ülkenin kurallarına göre yapılır (`lib/compliance`). Varsayılan "TR"
   * (`DEFAULT_COMPLIANCE_REGION`). Onaya gönderme ve onay bu bölgeye göre engellenir.
   */
  complianceRegion: ComplianceRegion;
  /**
   * Hesabın İÇERİK dili (hook/script/açıklama taslağı bu dilde üretilir; panel metni hep Türkçe). undefined = ayarlanmadı: dil
   * `resolveContentLanguage` ile bulunur (kendi transcript dilleri → uyum bölgesi → en). DB `content_language` NULL.
   */
  contentLanguage?: ContentLanguage;
  /**
   * Hesap türü (`business` işletme/koç · `creator` içerik üreticisi · `mixed` karma; migration 0015, DB varsayılanı `business`): kreatif
   * matrisleri, açı etiketlemesini, CTA önerisini ve plan karmasını belirler (`domain/account-type.ts`). Her zaman dolu.
   */
  accountType: AccountType;
  createdAt: string;
}
