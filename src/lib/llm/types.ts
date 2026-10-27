/**
 * Metin LLM görevlerinin ortak sözleşmesi: arka uç arayüzü, çağrı isteği/sonucu, çağrı meta'sı ve tipli hata. Görevler
 * (`screen-topics`, `voice-profile`, `cluster-topics`, `synthesize-week`, `generate-ideas`) yalnız `LlmBackend`'e konuşur;
 * hangi arka ucun (yerel Claude CLI ya da deploy'da Claude API) çalıştığını bilmez (`backend.ts`).
 *
 * Meta (`LlmCallMeta`) her çağrıda döner ve Dalga 2'de `collection_runs` satırına yazılır (eşleme: `RUN_PROVIDER_OF_BACKEND`,
 * `kind`, `billing`, token sayıları, süre). Faturalama: Claude CLI `subscription` (tutar yok); `costUsd` yalnız BİLGİ amaçlıdır.
 */
import "server-only";

import type { z } from "zod";

/** `collection_runs.kind` değerleri (domain `RunKind`'in LLM alt kümesi). */
export const LLM_KINDS = [
  "llm_topic_screen",
  "llm_voice_profile",
  "llm_topic_cluster",
  "llm_week_synthesis",
  "llm_idea_generation",
  "llm_angle_label",
  "llm_briefing",
  "llm_chat",
  "llm_director",
] as const;
export type LlmKind = (typeof LLM_KINDS)[number];

export const LLM_BACKEND_IDS = ["claude_cli", "anthropic_api"] as const;
export type LlmBackendId = (typeof LLM_BACKEND_IDS)[number];

/** Arka uç → `collection_runs.provider` (DB check ile birebir). */
export const RUN_PROVIDER_OF_BACKEND: Record<LlmBackendId, "claude_cli" | "anthropic"> = {
  claude_cli: "claude_cli",
  anthropic_api: "anthropic",
};

/** Arka uç → `collection_runs.billing`. */
export const BILLING_OF_BACKEND: Record<LlmBackendId, "subscription" | "metered"> = {
  claude_cli: "subscription",
  anthropic_api: "metered",
};

export interface LlmUsage {
  /** Toplam girdi tokeni: önbellekten okunan ve önbelleğe yazılan dahil (`collection_runs.input_tokens`). */
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCallMeta {
  kind: LlmKind;
  backend: LlmBackendId;
  billing: "subscription" | "metered";
  /** Zarfın bildirdiği model (ör. "claude-opus-5-5"); bildirilmediyse istekteki ad; ikisi de yoksa undefined. */
  model?: string;
  /** Toplam süre (ms): düzeltme turu dahil tüm süreç çağrıları. */
  durationMs: number;
  /** Model çağrısı sayısı: 1 = ilk yanıt geçerli, 2 = düzeltme turu yapıldı. */
  attempts: number;
  /** Yalnız bilgi (liste fiyatı üzerinden, abonelikte tahsil edilmez); faturalama kararında KULLANILMAZ. */
  costUsd?: number;
  usage?: LlmUsage;
}

export interface LlmJsonRequest<T> {
  task: LlmKind;
  /** Sistem istemi (değişmeyen talimat). Veri `input`'tadır, talimat değildir. */
  system?: string;
  /** Kullanıcı girdisi: stdin'den gider (argüman boyu sınırı yüzünden argümana KONMAZ). */
  input: string;
  /** Çıktı şeması: hem modele (`--json-schema`) hem doğrulamaya gider. Kök nesne olmalı. */
  schema: z.ZodType<T>;
  timeoutMs?: number;
  /** CLI model takma adı ya da tam adı ("sonnet", "opus" …); verilmezse CLI varsayılanı. */
  model?: string;
  /**
   * Anlamsal (kod) denetimi: şemadan geçen değeri inceler; sorun varsa modele geri verilecek kısa metni döndürür (yoksa
   * undefined). Sorun varsa ve hak kaldıysa düzeltme turu yapılır.
   */
  review?: (value: T) => string | undefined;
  /** Son denemede de `review` sorun bulursa: "throw" (varsayılan, `invalid_output`) ya da "accept" (değer + `reviewFeedback` döner). */
  reviewFailure?: "throw" | "accept";
  /**
   * Bu çağrı için en çok model çağrısı (varsayılan: arka ucun genel değeri, ilk yanıt + 1 düzeltme turu). 1 = düzeltme turu YOK:
   * `review` ya da şema sorun bulursa ikinci çağrı yapılmaz (`reviewFailure` kararı hemen uygulanır). Genel değeri DEĞİŞTİRMEZ.
   */
  maxAttempts?: number;
}

export interface LlmJsonResult<T> {
  value: T;
  meta: LlmCallMeta;
  /** `reviewFailure: "accept"` ile kabul edilen son sorun metni (çağıran değeri kendi kuralıyla süzer). */
  reviewFeedback?: string;
}

export interface LlmBackend {
  readonly id: LlmBackendId;
  runJson<T>(request: LlmJsonRequest<T>): Promise<LlmJsonResult<T>>;
}

export type LlmErrorCode =
  /** Girdi kabul edilemez (boş, çok büyük, yanlış parti boyu). */
  | "invalid_input"
  /** Ortam yapılandırması geçersiz (`LLM_BACKEND`). */
  | "invalid_config"
  /** Süreç başlatılamadı (CLI yok/PATH'te değil). */
  | "spawn_failed"
  | "timeout"
  | "output_too_large"
  /** CLI hata bildirdi (`is_error`, sıfır olmayan çıkış: oturum yok, limit dolu …). */
  | "cli_failed"
  /** Zarf (CLI'nin JSON sarmalayıcısı) okunamadı. */
  | "envelope_invalid"
  /** Yanıt, düzeltme turundan sonra da şemaya/kod denetimine uymadı. */
  | "invalid_output"
  | "not_implemented";

/** Tipli hata: `meta` hata anına kadarki süre/deneme sayısıdır (başarısız koşu satırı için). */
export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    readonly meta?: Partial<LlmCallMeta>,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
