/**
 * Etiketleme seçimi (saf; DB/ağ yok). Etiketlenecek içerik:
 *  - analizi `ok` (analiz yoksa/`failed`/`insufficient_data` ise etiketlenmez: metin kanıtı yok);
 *  - niş dışı RAKİP değil (`content_topic_screens.in_niche = false` rakip çıkar; kendi videolar eleğe bakılmadan girer, analiz seçimiyle aynı);
 *  - GÜNCEL istem sürümüyle etiketi yok (etiketi olmayan ya da `prompt_version`'ı eski olan; güncel sürümlü etiket — doğrulanmamış olsa da —
 *    yeniden sorulmaz: aynı alıntı sorunu aynı model çağrısını boşa tekrarlar);
 *  - en az bir metin kanalı var (konuşma/ekran yazısı/açıklama; süresi dolan transcript okunmadığı için yalnız açıklama kalmış olabilir).
 * Sıra: kendi videolar önce, sonra rakipler lift azalan (ölçülemeyen sonda; undefined ≠ 0), eşitlikte id. `limit` sıradan sonra uygulanır.
 * Not: "karar verilemedi" (`unsure`) satır bırakmaz; o içerik sonraki koşuda yeniden seçilir (satırın yokluğu = etiketlenmedi).
 */
import { accountTypeLabel, appliesAngleLabeling, type AccountType } from "@/lib/domain/account-type";
import type { ContentItem } from "@/lib/domain/content";
import type { AnalysisStatus } from "@/lib/domain/intel";
import { hasAnyText } from "@/lib/llm/content-text";

/**
 * Hesap türü açı × farkındalık etiketlemesini uygulamıyorsa çalışma alanı etiketlemeden TAMAMEN atlanır (içerik bu çerçeveye uymaz: çoğu video
 * "belirsiz" çıkar, model çağrısı boşa gider). Atlama nedeni (Türkçe) döner; uygulanıyorsa undefined. Etiketleme (`label-run`) ve rutin durumu
 * (`orchestrator/state`, `plan-routine`) AYNI kuralı kullanır: tür tek yerde (`appliesAngleLabeling`) dallanır.
 */
export function labelingSkipReason(accountType: AccountType): string | undefined {
  return appliesAngleLabeling(accountType)
    ? undefined
    : `Hesap türü "${accountTypeLabel(accountType)}": açı × farkındalık etiketlemesi uygulanmaz (konu × hook matrisi kullanılır); çalışma alanı atlandı.`;
}

export interface LabelCandidate {
  id: string;
  isOwn: boolean;
  /** Ölçülemediyse undefined. */
  lift?: number;
  /** Analizin durumu; hiç analiz yoksa undefined. */
  analysisStatus?: AnalysisStatus;
  /** Konu eleği: false niş dışı · true niş içi · undefined elenmedi. */
  inNiche?: boolean;
  /** Mevcut etiketin `prompt_version`'ı; etiket yoksa undefined. */
  labelPromptVersion?: string;
  /** Konuşma/ekran yazısı/açıklamadan en az biri dolu mu. */
  hasText: boolean;
}

/**
 * İçerik → etiket adayı. Etiketleme koşusu (`label-run`) ve rutin durumu (`orchestrator/state`) AYNI kurulumu kullanır (rutinin
 * "etiketlenecek N" sayısı gerçek koşuyla ayrışmasın). `inNiche`: ham konu eleği sonucu; `transcript`: süresi dolmamış metin kanalları.
 */
export function toLabelCandidate(
  item: Pick<ContentItem, "id" | "owner" | "score" | "analysisStatus" | "caption">,
  extra: { transcript?: { speech?: string; screen?: string }; inNiche?: boolean; labelPromptVersion?: string },
): LabelCandidate {
  return {
    id: item.id,
    isOwn: item.owner.kind === "own",
    lift: item.score.lift,
    analysisStatus: item.analysisStatus,
    inNiche: extra.inNiche,
    labelPromptVersion: extra.labelPromptVersion,
    hasText: hasAnyText({ caption: item.caption, transcript: extra.transcript?.speech, screenText: extra.transcript?.screen }),
  };
}

export interface LabelSelectionCounts {
  /** Değerlendirilen içerik sayısı. */
  considered: number;
  /** Etiketlenecek (limit ÖNCESİ). */
  eligible: number;
  /** Güncel sürümle zaten etiketli. */
  alreadyLabeled: number;
  offNiche: number;
  /** Analizi `ok` olmayan. */
  notAnalyzed: number;
  noText: number;
  /** Etiketi var ama istem sürümü eski (yeniden etiketlenecekler; `eligible` içinde). */
  staleVersion: number;
}

export interface LabelSelection {
  selected: LabelCandidate[];
  counts: LabelSelectionCounts;
}

export interface LabelSelectOptions {
  /** Güncel istem sürümü (`label-angles` `PROMPT_VERSION`). */
  promptVersion: string;
  limit?: number;
}

function byPriority(a: LabelCandidate, b: LabelCandidate): number {
  if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
  if (a.lift !== b.lift) {
    if (a.lift === undefined) return 1;
    if (b.lift === undefined) return -1;
    return b.lift - a.lift;
  }
  return a.id.localeCompare(b.id);
}

export function selectForLabeling(candidates: readonly LabelCandidate[], options: LabelSelectOptions): LabelSelection {
  const counts: LabelSelectionCounts = { considered: candidates.length, eligible: 0, alreadyLabeled: 0, offNiche: 0, notAnalyzed: 0, noText: 0, staleVersion: 0 };
  const eligible: LabelCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.analysisStatus !== "ok") counts.notAnalyzed++;
    else if (!candidate.isOwn && candidate.inNiche === false) counts.offNiche++;
    else if (candidate.labelPromptVersion === options.promptVersion) counts.alreadyLabeled++;
    else if (!candidate.hasText) counts.noText++;
    else {
      if (candidate.labelPromptVersion !== undefined) counts.staleVersion++;
      eligible.push(candidate);
    }
  }
  counts.eligible = eligible.length;
  const ordered = eligible.sort(byPriority);
  return { selected: options.limit === undefined ? ordered : ordered.slice(0, options.limit), counts };
}

/** Etiketlenecek aday sayısı (limit ÖNCESİ): `label` işi ve halka sayacı AYNI kuralı kullanır. */
export function countLabelable(candidates: readonly LabelCandidate[], promptVersion: string): number {
  return selectForLabeling(candidates, { promptVersion }).counts.eligible;
}
