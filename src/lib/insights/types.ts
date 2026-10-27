/**
 * Haftalık plan taslağının (LLM'siz, `buildPlanDraft`) girdi ve çıktı tipleri. Bölümler `WeeklyPlanSections`'tır
 * (`domain/weekly-plan.ts`, `WEEKLY_PLAN_SECTIONS_SCHEMA` ile geçerli); metin alanları (`why`, `rationale`) taslakta boş ya da
 * kısa kod metnidir, asıl gerekçeyi `synthesize-week` görevi (LLM) doldurur. Hiçbir alan `Date.now()` okumaz: saat `now`dır.
 */
import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import type { ContentItem } from "@/lib/domain/content";
import type { ContentAnalysis } from "@/lib/domain/intel";
import type { ConfidenceLevel, FocusGroup, WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import type { ZoneSource } from "@/lib/insights/audience-zone";
import type { FeedbackReview } from "@/lib/insights/feedback";
import type { PlanMode } from "@/lib/insights/mode";

/**
 * Hook grupları için analizden gereken alanlar. Yalnız `status = ok` VE `evidenceVerified` analiz sayılır (kanıtı doğrulanmamış
 * etiketten yön çıkarılmaz). Tam `ContentAnalysis` de geçer.
 */
export type AnalysisRef = Pick<ContentAnalysis, "contentItemId" | "status" | "evidenceVerified" | "hookType">;

/** Konu kümesi (LLM `cluster-topics` üretir; isteğe bağlı girdi). Küme yoksa `topic_cluster` ekseni boş kalır. */
export interface TopicCluster {
  id: string;
  /** Ekranda görünen ad; yön/aday `value`'su bu addır. */
  label: string;
  contentItemIds: readonly string[];
}

export interface PlanDraftInput {
  /** Planın haftası ("YYYY-MM-DD"); Pazartesi değilse haftasının Pazartesi'sine hizalanır. Geçersiz tarih → hata. */
  weekStart: string;
  /** Tek saat: pencereler ("son 30 gün") ve "geçmişte slot yok" kuralı bununla. */
  now: Date;
  /** Takvim saat dilimi: `audienceTimeZone`, yoksa `timezone` (`audienceZone`). */
  workspace: ZoneSource;
  own: readonly OwnAccount[];
  /** Yalnız `status = tracked` olanlar hesaba girer. */
  competitors: readonly Competitor[];
  /** Kendi + rakip içerikleri, skor önbelleğiyle (`score.lift`, `score.immature`). Kısa olmayan videolar süzülür. */
  items: readonly ContentItem[];
  /** Plan bu kendi hesap için (ses/yenilik kaynağı); verilmezse tüm kendi hesaplar. */
  accountId?: string;
  analyses?: readonly AnalysisRef[];
  clusters?: readonly TopicCluster[];
  /** Konu eleğinin niş dışı bulduğu içerikler: hiçbir yönün/adayın/tutanın kanıtı olmaz; "kaçın"da listelenir. */
  offNicheContentIds?: readonly string[];
  /**
   * Konu eleğinden geçen TÜM içerikler (niş içi + niş dışı). Hesap düzeyinde "niş dışı" kararının paydası: verilmezse kaç videonun
   * elendiği bilinmez ve hesap "kaçın"a yazılmaz (video düzeyinde dışlama `offNicheContentIds` ile yine olur).
   */
  screenedContentIds?: readonly string[];
  /**
   * Geçen haftaların plan sonucu (son 4 hafta, `WeekReview`'dan): yön puanına 0,85–1,15 çarpan olarak girer (`feedback.ts`).
   * Verilmezse ya da okunamadıysa çarpan 1'dir (çağıran nedenini nota yazar).
   */
  reviews?: readonly FeedbackReview[];
}

/**
 * İçerik adayı: fikir üretimine giren, ≥ 2 farklı kanıtı ve ≥ 1 rakip tutanı olan yön. Plana ilk 3–5'i alınır
 * (`plannedCandidateIds`), kalanı alternatif kalır. Her aday bir rakip tutanından (tohum) doğar.
 */
export interface PlanCandidate {
  /** Kararlı kimlik: `cand:<tohum içerik kimliği>` (tohum başına tek aday); LLM çıktısı bu kimlikle eşlenir. */
  id: string;
  /** Adayın ana yönü (kanıt grubu): taksonomi anahtarı ya da küme adı. */
  group: FocusGroup;
  value: string;
  label: string;
  /** Adayı doğuran rakip tutanı (kanıtların ilki). */
  seedContentItemId: string;
  /** ≥ 2 farklı içerik: tohum ilk, sonra destekçiler (lift azalan). */
  evidenceContentIds: string[];
  /** Adayın dayanağı: `rivals` (rakip tutanı) ya da `own` (rakipsiz mod: kendi tutanı). */
  basis: PlanMode;
  /** Kanıtlar arasındaki rakip tutanları (`basis = rivals` iken ≥ 1): ≥ 3x; yoksa ≥ 2x ve `relaxedWinner`. Rakipsiz modda boş. */
  rivalWinnerIds: string[];
  /** Kanıtlar arasındaki KENDİ tutanları (`basis = own` iken ≥ 1; eşikler rakip kuralıyla aynı). Rakip modunda boş. */
  ownWinnerIds: string[];
  relaxedWinner: boolean;
  /** Kanıtların ortalama lift'i. */
  evidenceMeanLift: number;
  /** Kendi hesap bu yönü denemediyse 1,5; denediyse 1. */
  novelty: number;
  ownTried: boolean;
  /** Kanıtların, kendi tutan konu kümelerine düşen payı (0..1); küme ya da kendi tutanı yoksa undefined (0 değil). */
  ownTopicMatch?: number;
  /** Sıra puanı: kanıt ortalama lift × yenilik × kendi tutan konularına uyum. */
  rankScore: number;
  /** Yönün örnek sayısından güven (n < 5 düşük). */
  confidence: ConfidenceLevel;
}

/** Taslağın dayandığı veri özeti (günlük/kuru koşu çıktısı için). */
export interface PlanDraftStats {
  rivalVideos: number;
  ownVideos: number;
  /** Niş dışı elenen video sayısı. */
  offNicheVideos: number;
  /** Doğrulanmış hook analizi olan rakip / kendi video sayısı. */
  analyzedRivals: number;
  analyzedOwn: number;
}

export interface WeeklyPlanDraft {
  /** Pazartesi'ye hizalı hafta başı. */
  weekStart: string;
  /** Planın öğrenme kaynağı (`mode.ts`): rakip tutanları ya da (rakipsiz) kendi tutanların. */
  mode: PlanMode;
  /** Mod notu (Türkçe): plan notuna yazılır. */
  modeNote: string;
  sections: WeeklyPlanSections;
  /** Fikir üretimine girecek adaylar, `rankScore` azalan (en çok `CANDIDATE_LIMIT`). */
  candidates: PlanCandidate[];
  /** Plana alınanlar (en çok 3–5): `candidates`'ın başı; sıra = takvim slotu sırası (`slots[i].position = i + 1`). */
  plannedCandidateIds: string[];
  /** Planın genel güveni: en yüksek yönün ve plana alınan adayların en zayıfı; veri yoksa düşük. */
  confidence: ConfidenceLevel;
  stats: PlanDraftStats;
}
