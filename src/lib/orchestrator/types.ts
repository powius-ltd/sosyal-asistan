/**
 * Haftalık rutin (orkestratör) ortak tipleri. Orkestratör KODDUR: durumu okur, her adım için `run | skip | needs_approval` kararını
 * saf fonksiyonla (`plan-routine.ts`) verir, adımları sırayla koşturur ve raporu birleştirir. LLM yalnız adımların içindedir.
 * Plan: `docs/AJAN-PLAN.md` §3.
 */
import type { AccountType } from "@/lib/domain/account-type";
import type { BriefingFreshness } from "@/lib/domain/briefing";

/** Karar verilen adımlar (0 önkontrol/bakım ve 7 rapor her zaman koşar, karar gerektirmez). */
export const ROUTINE_STEPS = ["collect", "analyze", "label", "cluster", "plan", "measure_check", "briefing"] as const;
export type RoutineStepId = (typeof ROUTINE_STEPS)[number];

/** Raporda görünen adım kimlikleri: önkontrol (0) + karar adımları (1–6). */
export type ReportStepId = "precheck" | RoutineStepId;

export const STEP_TITLE: Record<ReportStepId, string> = {
  precheck: "0 · Önkontrol + bakım",
  collect: "1 · Topla (Apify)",
  analyze: "2 · Video analizi (agy)",
  label: "3 · Açı etiketle (Claude)",
  cluster: "4 · Konu kümele (Claude)",
  plan: "5 · Haftalık plan (Claude)",
  measure_check: "6 · Ölçüm kontrolü",
  briefing: "7 · Brifing (Analist)",
};

/** Adımın komutu: onay bekleyen / elle koşturulacak işte kullanıcıya gösterilir. */
export const STEP_COMMAND: Partial<Record<RoutineStepId, string>> = {
  collect: "npm run collect:now",
  analyze: "npm run analyze:now",
  label: "npm run label:angles",
  plan: "npm run plan:week",
  briefing: "npm run brief:now",
};

/** Adımın PARA harcayıp harcamadığı: yalnız Apify (abonelik çağrıları $0). */
export const SPENDING_STEPS: readonly RoutineStepId[] = ["collect"];

export type StepDecision =
  | { action: "run"; reason: string }
  | { action: "skip"; reason: string }
  | { action: "needs_approval"; reason: string; estimateUsd?: number };

export interface PlanEntry {
  step: RoutineStepId;
  decision: StepDecision;
}

export type RoutinePlan = readonly PlanEntry[];

/**
 * Durum: `loadRoutineState` DB'den okur (salt okuma, sabit sayıda sorgu); `planRoutine` yalnız bunu görür (saf).
 * Bilinmeyen/ölçülemeyen alan `undefined`'dır (0 değil).
 */
export interface RoutineState {
  /** Tek saat (ISO): rutinin başladığı an. */
  now: string;
  /** Çalışma alanının hesap türü: etiket ve kümele adımlarının uygulanıp uygulanmadığını belirler (`account-type`). */
  accountType: AccountType;
  /** Planın hedef haftası (Pazartesi, YYYY-MM-DD): `plan:week` varsayılanıyla aynı (gelecek Pazartesi). */
  planWeek: string;
  /** `--apify-max` ile verilen onaylı Apify tavanı (USD); yoksa undefined = onay YOK. */
  apifyMaxUsd?: number;
  collection: {
    /** Son başarılı Apify toplaması (ISO); kayıt yoksa undefined. */
    lastCollectedAt?: string;
    /** Son toplama oturumunun toplam tutarı (USD; geçmiş tahmin referansı); kayıt yoksa undefined. */
    referenceUsd?: number;
    /** Son brifingten sonra ilk kez görülen içerik sayısı (brifing yoksa tüm içerik). */
    newContentSinceBriefing: number;
  };
  /** Analizsiz, seçilebilir video sayısı (kayıtlı konu eleği dikkate alınır; elenmemiş rakip seçilebilir sayılır). */
  analysis: { selectable: number };
  /** Etiketlenecek video sayısı (analizi ok, güncel sürümle etiketsiz, metni var); açı etiketlemesi uygulanmayan türde 0. */
  labeling: { eligible: number };
  /**
   * Konu kümeleme (yalnız konu × hook matrisi kullanan türlerde anlamlı). `available`: kümeleme adımı bağlı mı (`RoutineWiring.clusterOnly`);
   * bağlı değilse adım atlanır. `clusteredCount` / `unclusteredCount`: matristeki kümeli / kümesiz analizli video; okunamıyorsa (depo henüz
   * uygulamıyor) undefined (0 değil).
   */
  clustering: { available: boolean; clusteredCount?: number; unclusteredCount?: number };
  /** Hedef hafta için plan kaydı; yoksa `exists: false`. */
  plan: { exists: boolean; status?: string; plannedCount?: number };
  measurement: {
    /** Ölçümü gelen kendi Reels sayısı. */
    dueCount: number;
    /** Ölçüm tavanı onaylı mı (`measure:now` ancak onayla koşar). */
    capApproved: boolean;
  };
  briefing: {
    /** Son brifingin üretim anı (ISO); yoksa undefined. */
    generatedAt?: string;
    /** Brifing yoksa undefined. */
    freshness?: BriefingFreshness;
  };
}

// ------------------------------------------------------------------ Sonuç

export type StepStatus = "ok" | "skipped" | "failed" | "needs_approval";

/** Bir adımın koşu çıktısı (adaptör üretir). */
export interface StepOutput {
  status: StepStatus;
  /** Tek satır özet / sebep. */
  reason: string;
  notes?: string[];
  /** Kalıcı LLM hatası (Claude CLI yok/oturum yok): kalan LLM adımları (3, 4, 5, 7) denenmez. */
  llmUnavailable?: boolean;
  /** Para harcayan adımda tahmin / gerçek (USD); bilinmeyen undefined. */
  spend?: { estimateUsd?: number; actualUsd?: number };
  /** Brifingin "plan durumu" olarak göreceği kısa not (plan adımı üretir). */
  planNote?: string;
}

export interface StepResult extends StepOutput {
  step: ReportStepId;
  seconds: number;
}

export interface RoutineReport {
  /** Rutinin başladığı an (ISO). */
  startedAt: string;
  dryRun: boolean;
  state?: RoutineState;
  plan?: RoutinePlan;
  steps: StepResult[];
  exitCode: RoutineExitCode;
}

/** 0 hepsi ok ya da tasarım gereği atlandı/onay bekliyor · 4 kısmi (en az bir adım failed) · 1 önkontrol. */
export type RoutineExitCode = 0 | 1 | 4;
