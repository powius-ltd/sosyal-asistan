/**
 * Ajan brifingi (Genel bakışta "Bugün bilmen gerekenler"): Analist'in 1–5 maddelik, kanıt ref'li, sayıları KODLA yerleştirilmiş
 * özeti. Tablo: `agent_briefings` (migration 0012); yazan ve okuyan aynı zod şemalarını kullanır (`lib/data/briefing-schema.ts`).
 * Plan: `docs/AJAN-PLAN.md` §2.
 *
 * Kurallar: maddenin metni (`body`) SON metindir: sayılar belirteçle yazılıp kodca yerleştirilmiştir, render'da LLM çağrısı ve
 * sayı üretimi yoktur. Güven (`confidence`) ajan yazmaz: kanıt ref'lerinin en zayıfıdır (kodla). Kanıt ref'leri kararlı kimliklerdir
 * (biçim ve ayrıştırma `briefing-refs.ts`); bağlantı (href) saklanmaz, render'da `routes.ts`'ten türer. Ölçülemeyen değer metne GİRMEZ
 * (`undefined` ≠ 0). Bayatlık `briefingFreshness` ile kodla belirlenir.
 */
import type { CreativeAngle, FunnelStage } from "@/lib/domain/creative-matrix";
import type { CheckpointDay } from "@/lib/domain/outcomes";
import type { CollectionRun } from "@/lib/domain/run";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { DAY_MS } from "@/lib/time";

/** `agent_briefings.payload.schemaVersion`: payload biçimi değişirse artar (eski satırlar okunurken sürüme bakılır). */
export const BRIEFING_SCHEMA_VERSION = 1;

/** Brifingi üreten rol (`agent_briefings.agent`). İleride yeni roller eklenir; `getLatestBriefing` Analist'inkini okur. */
export const BRIEFING_AGENTS = ["analyst"] as const;
export type BriefingAgent = (typeof BRIEFING_AGENTS)[number];
export const ANALYST_AGENT: BriefingAgent = "analyst";

// ------------------------------------------------------------------- Madde

/** Madde türü: ne değişti · ne tuttu · matriste fırsat · sıradaki adım · bekleyen iş. */
export const BRIEFING_ITEM_KINDS = ["changed", "worked", "opportunity", "next_step", "pending"] as const;
export type BriefingItemKind = (typeof BRIEFING_ITEM_KINDS)[number];

export const BRIEFING_ITEM_KIND_LABEL: Record<BriefingItemKind, string> = {
  changed: "Ne değişti",
  worked: "Ne tuttu",
  opportunity: "Fırsat",
  next_step: "Sıradaki adım",
  pending: "Bekleyen",
};

/** Madde sayısı: en az 1 ("güçlü bir şey yok" de bir maddedir), en çok 5. DB check'i (0012) aynı sınırdır. */
export const BRIEFING_ITEMS_MIN = 1;
export const BRIEFING_ITEMS_MAX = 5;
/** Metin sınırları (karakter, kod noktası): kart okunur kalsın. */
export const BRIEFING_HEADLINE_MAX = 100;
export const BRIEFING_BODY_MAX = 500;
export const BRIEFING_ACTION_LABEL_MAX = 60;
/** Bir maddenin en çok kanıt ref'i. */
export const BRIEFING_EVIDENCE_MAX = 6;

/**
 * Kanıt ref'i: pakette kararlı kimlikle anılan olgu. Biçimler:
 *  - `c:<contentId>`            içerik (video)
 *  - `cell:<katman>:<açı>`      Kreatif Matris hücresi (`FUNNEL_STAGE_IDS` × `CREATIVE_ANGLE_IDS`)
 *  - `topic:<küme>:<hook>`      Konu × hook türü matrisi hücresi (`creator`/`mixed` hesap; küme anahtarı × `HOOK_TYPES`)
 *  - `plan:<hafta>`             haftalık plan (haftanın Pazartesi'si, YYYY-MM-DD)
 *  - `idea:<ideaId>`            fikir kartı (ör. öneri bekleyen fikir ↔ Reels bağı)
 *  - `due:<contentId>:d<gün>`   ölçümü gelen Reels (D+1/3/7; ör. `due:ci_12:d7`)
 * Ayrıştırma/doğrulama/üretim: `briefing-refs.ts`.
 */
export type BriefingEvidenceRef =
  | `c:${string}`
  | `cell:${FunnelStage}:${CreativeAngle}`
  | `topic:${string}:${string}`
  | `plan:${string}`
  | `idea:${string}`
  | `due:${string}:d${CheckpointDay}`;

// ------------------------------------------------------------------- Eylem

/** Eylem türü (kod üretir, ajan icat edemez): sayfa aç (video/plan/matris), öneri bağını onayla, komut göster. */
export const BRIEFING_ACTION_TYPES = ["open_video", "open_plan", "open_matrix", "approve_link", "run_cmd"] as const;
export type BriefingActionType = (typeof BRIEFING_ACTION_TYPES)[number];

/** Komut kimlikleri: `run_cmd` eylemi YALNIZ bu listeden komut gösterir (ajan serbest komut yazamaz). */
export const BRIEFING_COMMAND_IDS = ["collect", "analyze", "label", "plan", "measure", "brief", "routine"] as const;
export type BriefingCommandId = (typeof BRIEFING_COMMAND_IDS)[number];

export interface BriefingCommand {
  /**
   * npm betik adı (`collect:now`). Kopyalanabilir komut YALNIZ `workspaceCommand(script, çalışmaAlanı)` (`lib/workspace/command.ts`)
   * ile kurulur: `npm run <betik> -- --workspace=<slug>` (bayraksız komut varsayılan çalışma alanında çalışırdı).
   */
  script: string;
  /** Düğme/etiket metni. */
  label: string;
  /** Paralı (Apify) mı: kart bunu açıkça işaretler. `collect:now` ve `measure:now` Apify harcar; geri kalanı abonelik/$0. */
  spendsMoney: boolean;
}

export const BRIEFING_COMMANDS: Record<BriefingCommandId, BriefingCommand> = {
  collect: { script: "collect:now", label: "Veriyi topla", spendsMoney: true },
  analyze: { script: "analyze:now", label: "Videoları analiz et", spendsMoney: false },
  label: { script: "label:angles", label: "Açıları etiketle", spendsMoney: false },
  plan: { script: "plan:week", label: "Haftalık planı üret", spendsMoney: false },
  measure: { script: "measure:now", label: "Ölçüm koşusu", spendsMoney: true },
  brief: { script: "brief:now", label: "Brifingi yenile", spendsMoney: false },
  routine: { script: "rutin", label: "Haftalık rutin", spendsMoney: false },
};

/**
 * Eylem. Hedef bağlantısı (href) SAKLANMAZ: `target` ref'inden `briefingActionHref` (routes.ts) türetir; komut metni
 * `commandId`'den `BRIEFING_COMMANDS` ile gelir. Eşleşme: `open_video` → `c:`/`due:` · `open_plan` → `plan:` · `open_matrix` → `cell:`/`topic:`
 * (ya da hedefsiz: matris sayfası) · `approve_link` → `idea:` · `run_cmd` → `commandId` (hedef yok). `spendsMoney` komut tablosuyla
 * tutarlıdır (`run_cmd`'de tablodaki değer, diğerlerinde false).
 */
export type BriefingAction = {
  type: BriefingActionType;
  /** Düğme metni (kod üretir). */
  label: string;
  target?: BriefingEvidenceRef;
  commandId?: BriefingCommandId;
  spendsMoney: boolean;
};

// ------------------------------------------------------------------ Brifing

/**
 * Brifing maddesi. `body` = sayıları yerleştirilmiş SON metin; `confidence` = kanıt ref'lerinin en zayıfı (ajan yazmaz).
 * (jsonb'ye yazılan şekiller `interface` değil `type` takma adıdır: `Json` tipine atanabilsin.)
 */
export type BriefingItem = {
  kind: BriefingItemKind;
  headline: string;
  body: string;
  /** ≥ 1 ref (pakette var olanlar). */
  evidence: BriefingEvidenceRef[];
  action?: BriefingAction;
  confidence: ConfidenceLevel;
};

/**
 * Dayanak: brifing hangi veriye bakılarak yazıldı. Alt satırda gösterilir ("N analiz, son toplama T"). Bilinmeyen alan
 * `undefined`'dır (0 değil): ör. hiç toplama kaydı yoksa `lastCollectedAt` yok.
 */
export type BriefingBasis = {
  /** Analizi `ok` olan video sayısı. */
  analyzedCount: number;
  /** Kanıtı doğrulanmış açı/katman etiketli video sayısı (matrise giren). */
  labeledCount: number;
  /** Üretim anındaki son başarılı toplama (ISO); kayıt yoksa undefined. */
  lastCollectedAt?: string;
  /** Dayandığı haftalık planın haftası (Pazartesi, YYYY-MM-DD); plan yoksa undefined. */
  planWeek?: string;
};

export interface Briefing {
  id: string;
  agent: BriefingAgent;
  /** Üretildiği an (ISO). */
  generatedAt: string;
  /** 1–5 madde (`BRIEFING_ITEMS_MIN..MAX`). */
  items: BriefingItem[];
  basis: BriefingBasis;
  /** Brifing isteminin sürümü (`analyst/prompt`). */
  promptVersion: string;
  /** Maskot kişiliğinin sürümü (`lib/agents/persona.ts` `PERSONA_VERSION`). */
  personaVersion: string;
  /** Modelin bildirdiği ad (ör. "claude-opus-5-5"); bildirilmediyse undefined. */
  model?: string;
  /** Üreten koşu (`collection_runs`); koşu silindiyse undefined. */
  runId?: string;
}

// ------------------------------------------------------------------ Bayatlık

/** Brifing bu günden eskiyse bayat sayılır (haftalık rutin ritmi: 7 gün + 1 gün pay). */
export const BRIEFING_STALE_DAYS = 8;

/** `new_data` = brifingten SONRA yeni veri toplandı · `too_old` = `BRIEFING_STALE_DAYS` günden eski (ya da zamanı okunamıyor). */
export type BriefingStaleReason = "new_data" | "too_old";

export type BriefingFreshness = { stale: false } | { stale: true; reason: BriefingStaleReason };

export const BRIEFING_STALE_REASON_LABEL: Record<BriefingStaleReason, string> = {
  new_data: "Bundan sonra yeni veri toplandı",
  too_old: `${BRIEFING_STALE_DAYS} günden eski`,
};

/**
 * Bayatlık kuralı (saf; kart ve rutin AYNI fonksiyonu kullanır). Bayat: (1) son BAŞARILI toplama brifingin üretiminden sonra ise
 * (`lastCollectedAt > generatedAt`: brifing eski veriye bakıyor) ya da (2) brifing `BRIEFING_STALE_DAYS` günden eski ise.
 * `lastCollectedAt` = ŞİMDİKİ son başarılı toplama (`latestSuccessfulCollectionAt`); bilinmiyorsa (undefined) yalnız yaş kuralı
 * uygulanır — bilinmeyen toplama "yeni veri yok" demek değildir ama bayat işaretlemek için de kanıt yoktur. Okunamayan zaman → bayat
 * (`too_old`: yaşı bilinmeyen brifinge güvenilmez). Sınırda tam 8 gün bayat DEĞİL, üstü bayat. İki sebep de varsa `new_data` döner.
 */
export function briefingFreshness(generatedAt: string, ctx: { now: Date; lastCollectedAt?: string }): BriefingFreshness {
  const generatedMs = Date.parse(generatedAt);
  const nowMs = ctx.now.getTime();
  if (Number.isNaN(generatedMs) || Number.isNaN(nowMs)) return { stale: true, reason: "too_old" };
  if (ctx.lastCollectedAt !== undefined) {
    const collectedMs = Date.parse(ctx.lastCollectedAt);
    if (!Number.isNaN(collectedMs) && collectedMs > generatedMs) return { stale: true, reason: "new_data" };
  }
  if (nowMs - generatedMs > BRIEFING_STALE_DAYS * DAY_MS) return { stale: true, reason: "too_old" };
  return { stale: false };
}

/**
 * Son BAŞARILI toplama anı: Apify sağlayıcılı ve verisi DB'ye yazılmış (`ingested`) koşuların en yenisinin bitişi (bitiş yoksa
 * başlangıcı). Hiç böyle koşu yoksa undefined. Kaynak: `listRuns(wsId, { provider: "apify", status: "ingested", limit })`;
 * Analist `basis.lastCollectedAt` için, kart bayatlık için bunu kullanır (tek kural).
 */
export function latestSuccessfulCollectionAt(runs: readonly Pick<CollectionRun, "provider" | "status" | "startedAt" | "finishedAt">[]): string | undefined {
  let best: { ms: number; iso: string } | undefined;
  for (const run of runs) {
    if (run.provider !== "apify" || run.status !== "ingested") continue;
    const iso = run.finishedAt ?? run.startedAt;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) continue;
    if (best === undefined || ms > best.ms) best = { ms, iso };
  }
  return best?.iso;
}
