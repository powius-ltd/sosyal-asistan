/**
 * Deterministik haftalık plan taslağı (docs/FAZ2-PLAN.md §5, LLM YOK): ne tuttu · neye yüklen · takvim · kaçın · geçen hafta
 * bölümleri ve fikir üretimine girecek içerik adayları. Saf fonksiyon: girdi veri, çıktı veri; saat `now`, dilim `workspace`dan,
 * DB/ağ yok. Çıktının `sections`'ı `WEEKLY_PLAN_SECTIONS_SCHEMA` ile geçerlidir; metin alanları (`why`, `rationale`) kısa kod
 * metni ya da boştur, `synthesize-week` doldurur. Analiz yokken de çalışır: hook grupları boş kalır, süre/CTA/sıklık yönleri üretilir.
 * Mod (`mode.ts`): pencerede ölçülmüş rakip videosu < `RIVAL_DATA_MIN` VE rakip verisinden yön çıkmıyorsa plan KENDİ tutanlarından öğrenir
 * ("own"; kendi videosundan da grup çıkmıyorsa mod değişmez); aksi halde (rakip verisi yeterli ya da yön çıkarıyor) davranış değişmez ("rivals").
 */
import { emptyPlanSections, weekStartOf, type ConfidenceLevel, type WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import { buildAvoid } from "@/lib/insights/avoid";
import { buildCandidates } from "@/lib/insights/candidates";
import { buildFeedback } from "@/lib/insights/feedback";
import { GROUP_WINDOW_DAYS, RIVAL_DATA_MIN } from "@/lib/insights/constants";
import { buildFocus } from "@/lib/insights/focus";
import { isPromisingGroup, scoreGroups } from "@/lib/insights/groups";
import { measuredRivalCount, modeNote, type PlanMode } from "@/lib/insights/mode";
import { buildPool } from "@/lib/insights/pool";
import { repeatGroup } from "@/lib/insights/repeat";
import { buildSchedule } from "@/lib/insights/schedule";
import type { PlanDraftInput, WeeklyPlanDraft } from "@/lib/insights/types";
import { buildWinners } from "@/lib/insights/winners";

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

/** En zayıf güven; hiç düzey yoksa düşük (veri yok = güven yok). */
function weakest(levels: readonly ConfidenceLevel[]): ConfidenceLevel {
  return levels.length === 0 ? "low" : levels.reduce((a, b) => (CONFIDENCE_RANK[b] < CONFIDENCE_RANK[a] ? b : a));
}

export function buildPlanDraft(input: PlanDraftInput): WeeklyPlanDraft {
  const weekStart = weekStartOf(input.weekStart);
  if (weekStart === undefined) throw new RangeError(`Geçersiz hafta başı: "${input.weekStart}" (YYYY-MM-DD bekleniyor).`);

  const pool = buildPool(input);
  const feedback = buildFeedback(input.reviews ?? []);
  const rivalGroups = scoreGroups(pool, feedback);
  const measuredRivals = measuredRivalCount(pool, GROUP_WINDOW_DAYS);
  const ownGroups = measuredRivals < RIVAL_DATA_MIN && !rivalGroups.some(isPromisingGroup) ? scoreGroups(pool, feedback, "own") : [];
  // Kendi videosundan da grup çıkmıyorsa öğrenilecek bir şey yoktur: mod değişmez (boş veri davranışı aynı kalır).
  const mode: PlanMode = ownGroups.length > 0 ? "own" : "rivals";
  const groups = mode === "own" ? ownGroups : rivalGroups;
  const repeat = mode === "own" ? repeatGroup(pool, feedback) : undefined;
  const schedule = buildSchedule(pool, weekStart);
  const candidates = buildCandidates(pool, groups, mode, repeat ? [repeat] : []);
  const planned = candidates.slice(0, schedule.postsPerWeek);
  const focus = buildFocus(groups, repeat);

  const sections: WeeklyPlanSections = {
    ...emptyPlanSections(),
    winners: buildWinners(pool, mode),
    focus,
    schedule,
    avoid: buildAvoid(groups, pool),
    review: { status: "awaiting_publish_data", note: "Geçen haftanın sonucu okuma anında hesaplanır: Bu hafta ekranındaki “Geçen hafta” bölümüne bak (ölçüm: npm run measure:now)." },
  };

  return {
    weekStart,
    mode,
    modeNote: modeNote(mode, measuredRivals),
    sections,
    candidates,
    plannedCandidateIds: planned.map((c) => c.id),
    confidence: weakest(focus.directions.length > 0 ? [focus.directions[0].confidence, ...planned.map((c) => c.confidence)] : []),
    stats: {
      rivalVideos: pool.rivals.length,
      ownVideos: pool.own.length,
      offNicheVideos: pool.offNiche.length,
      analyzedRivals: pool.rivals.filter((pi) => pi.hookType !== undefined).length,
      analyzedOwn: pool.own.filter((pi) => pi.hookType !== undefined).length,
    },
  };
}
