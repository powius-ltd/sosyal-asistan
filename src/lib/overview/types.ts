/**
 * Genel bakış "Özet" bloğunun girdi/çıktı tipleri (`docs/GENEL-BAKIS-TASARIM.md` §3). Girdideki her parça "okunamadı" olabilir
 * (`undefined`): ilgili cümle düşer, sayfa çökmez. `undefined` ≠ 0: sıfır ölçülmüş bir değerdir, okunamayan parça sıfır sayılmaz.
 */
import type { OwnAccount } from "@/lib/domain/competitor";
import type { CheckpointDay, WeekReview } from "@/lib/domain/outcomes";
import type { Overview } from "@/lib/domain/overview";
import type { WeeklyPlan } from "@/lib/domain/weekly-plan";

export interface SummaryLink {
  label: string;
  href: string;
}

/** Özet satırı: tek-iki cümle + isteğe bağlı "Neden?" bağlantısı. */
export interface SummaryLine {
  text: string;
  link?: SummaryLink;
}

export type SummaryAskId = "connect_account" | "approve_publish" | "confirm_links" | "shoot_next" | "measurement";

/** "Senden ne bekliyoruz" satırı: tek cümle + tek düğme. */
export interface SummaryAsk {
  id: SummaryAskId;
  text: string;
  action: SummaryLink;
}

export interface OverviewSummary {
  /** Henüz hesaba hiç bakılmamış (hesap yok ya da hiç veri yok): üç satırın yerine ilk-bakış metni. */
  empty: boolean;
  /** "Neredeyiz"; okunacak sayı yoksa undefined değil "henüz veri yok" cümlesi gelir, tamamen okunamazsa undefined. */
  where?: SummaryLine;
  /** "Bu hafta ne yaptık"; hiçbir parça okunamadıysa undefined (satır çizilmez). */
  done?: SummaryLine;
  /** Öncelik sırasına göre en çok `SUMMARY_ASKS_MAX`; boşsa "şu an senden bir şey beklemiyorum". */
  asks: SummaryAsk[];
}

/** Kendi tutan videoların özeti: sayı + en yüksek lift (ölçülemiyorsa undefined). */
export interface OwnOutlierStat {
  count: number;
  bestLift?: number;
}

/** Son 7 günde incelenen video sayısı; `truncated` = koşu sayfaları tavana dayandı, gerçek sayı daha büyük olabilir. */
export interface ActivityStat {
  analyzedVideos: number;
  truncated: boolean;
}

export interface OverviewSummaryInput {
  /** `isOperatorMode()`: yönetici bilgisi (ölçüm bütçesi onayı gibi) yalnız açıkken söylenir. */
  operator: boolean;
  accounts?: readonly Pick<OwnAccount, "id">[];
  overview?: Overview;
  ownOutliers?: OwnOutlierStat;
  /** Son başarılı toplama anı (`latestSuccessfulCollectionAt`); hiç yoksa undefined. */
  lastCollectedAt?: string;
  activity?: ActivityStat;
  newIdeas?: number;
  /** En son plan; `null` = hiç plan yok, `undefined` = okunamadı. */
  plan?: WeeklyPlan | null;
  review?: WeekReview | null;
  /** İçinde bulunulan haftanın Pazartesi'si (istek saatinden). */
  currentWeekStart?: string;
  pendingApproval?: number;
  /** Onay bekleyen otomatik Reels eşleşme önerisi sayısı. */
  suggestedLinks?: number;
  /** Ölçümü gelen videoların bekleyen kontrol noktası günleri (video başına bir). */
  measurementDueDays?: readonly CheckpointDay[];
  /** `workspace.measureMonthlyCapUsd !== undefined`: aylık ölçüm bütçesi onaylı mı. */
  measureCapApproved?: boolean;
}

/** Özet "senden bekliyoruz" listesinde en çok gösterilen iş sayısı. */
export const SUMMARY_ASKS_MAX = 3;
