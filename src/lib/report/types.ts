/** Haftalık yol haritası rapor modeli: ekranın çizdiği, tümü hazır düz metin (sayfa yalnız çizer; hesap `build-report.ts`'te). */

export interface ReportDirection {
  title: string;
  /** Veriden kurulan düz cümle(ler); ölçülemeyen değer cümleye girmez. */
  sentence: string;
}

export interface ReportCalendarRow {
  /** "Pazartesi 12 Eki"; saat atanmadıysa undefined. */
  day?: string;
  /** Hedef kitle saati, gerekirse İstanbul karşılığı ikinci satır; saat atanmadıysa boş. */
  timeLines: string[];
  title: string;
  /** Videonun sonunda izleyiciden istenen adım ("Yoruma kelime yazma"); belli değilse undefined. */
  endStep?: string;
}

export interface ReportVideo {
  position: number;
  title: string;
  /** "Pazartesi 12 Eki · 14:00 ET / 21:00 İstanbul"; saat atanmadıysa undefined. */
  when?: string;
  /** "yaklaşık 1 dk 45 sn"; süre bilinmiyorsa undefined. */
  duration?: string;
  /** Videonun ne anlattığı (jargon içermeyen gerekçe); yoksa undefined. */
  summary?: string;
  opening?: string;
  otherOpenings: string[];
  /** Konuşma metni paragrafları ya da (metin yoksa) çekim adımları. */
  body: { kind: "script" | "outline"; paragraphs: string[] } | undefined;
  caption?: string;
}

export interface ReportReviewRow {
  title: string;
  outcome: string;
}

export interface ReportReview {
  /** "5 Eki – 11 Eki 2026" gibi hafta aralığını çizen taraf `weekStart`'tan üretir. */
  weekStart: string;
  rows: ReportReviewRow[];
  directionLines: string[];
}

export interface ReportNote {
  headline: string;
  body: string;
}

export interface WeeklyReport {
  weekStart: string;
  workspaceName: string;
  /** "@" olmadan; kendi hesap bulunamazsa undefined. */
  handle?: string;
  /** Planın üretildiği gün, biçimli. */
  preparedOn?: string;
  lead: string;
  directions: ReportDirection[];
  calendar: ReportCalendarRow[];
  /** Takvimde "Sonundaki adım" sütunu çizilsin mi (en az bir satırda adım belli). */
  showEndStepColumn: boolean;
  avoid: string[];
  review?: ReportReview;
  notes: ReportNote[];
  videos: ReportVideo[];
  fewSamples: boolean;
}
