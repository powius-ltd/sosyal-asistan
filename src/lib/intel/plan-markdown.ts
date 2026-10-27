/**
 * Haftalık planın okunur Markdown çıktısı (`docs/haftalik-plan/<hafta>.md`; commit'lenmez). Saf: girdi veri, çıktı metin.
 * Türkçe başlıklar; hook/script/açıklama taslağı çalışma alanının içerik dilinde kalır (etiket: fikrin `scriptLanguage`'ı). Takvim saatleri
 * hedef kitle dilimi + İstanbul.
 * Ölçülemeyen değer "—" ile yazılır (0 değil). Yalnız plandaki içerikler ayrıntılıdır; adaylar tek satır.
 * Hesap türü verilirse başlıkta tür + amaç, karma türde slot dağılımı (erişim/satış) ve fikir başına amaç görünür; plan modu (rakipsiz ya da
 * rakipli) tek satırdır.
 */
import { LIFT_TIER_MIN } from "@/lib/domain/content";
import { accountTypeProfile, splitPlanSlots, type AccountType } from "@/lib/domain/account-type";
import type { IdeaDetails, RivalQuote } from "@/lib/domain/intel";
import { CONFIDENCE_LABEL, FOCUS_GROUP_LABEL, type ConfidenceLevel, type PlanWinner, type WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import { formatDate, formatDateTime, formatDecimal, formatDuration, formatLift } from "@/lib/format";
import { BASIS_LABEL, type PlanMode } from "@/lib/insights/mode";
import { PURPOSE_LABEL, purposeOfType, slotPurposes } from "@/lib/insights/slot-mix";
import { briefMarkdown } from "@/lib/intel/plan-markdown-brief";
import { claimsStillInHooksOrOutline, correctedFactLines } from "@/lib/intel/script-review-claims";
import type { PayloadIdea } from "@/lib/intel/plan-payload";
import type { CreativeBrief } from "@/lib/llm/creative-brief-schema";
import { WEEKDAY_NAMES } from "@/lib/time";

const ISTANBUL = "Europe/Istanbul";

export interface EvidenceRef {
  contentId: string;
  handle: string;
  isOwn: boolean;
  lift?: number;
  url?: string;
}

export interface PlanMarkdownInput {
  weekStart: string;
  generatedAt: Date;
  /** Hedef kitle saat dilimi (ör. America/New_York). */
  audienceZone: string;
  summary?: string;
  confidence: ConfidenceLevel;
  sections: WeeklyPlanSections;
  /** Kayıt sırasıyla (plana girenler önce). */
  ideas: readonly PayloadIdea[];
  evidenceOf: (contentId: string) => EvidenceRef;
  /** Uyarılar/atılan öğeler (Türkçe). */
  notes: readonly string[];
  voiceSummary?: string;
  /** Hesap türü: başlığa tür + amaç yazılır; karmada slot dağılımı ve fikir amacı görünür. Verilmezse yazılmaz. */
  accountType?: AccountType;
  /** Plan modu (`rivals` | `own`): öğrenme kaynağı tek satır. */
  mode?: PlanMode;
  /** Kreatif direktör brifi (varsa ilk bölüm; yoksa plan bugünkü gibi). */
  brief?: CreativeBrief;
}

const dash = (value: string | undefined): string => value ?? "—";
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;

/** Notlardaki içerik kimliklerini okunur bağlantıya çevirir (bilinmeyen kimlik olduğu gibi kalır). */
export function humanizeIds(text: string, evidenceOf: PlanMarkdownInput["evidenceOf"]): string {
  return text.replace(UUID, (id) => {
    const ref = evidenceOf(id);
    return ref.handle === "?" ? id : link(ref);
  });
}
const link = (ref: EvidenceRef): string => (ref.url === undefined ? `@${ref.handle}` : `[@${ref.handle}](${ref.url})`);
const quoteLine = (quote: RivalQuote | undefined, evidenceOf: PlanMarkdownInput["evidenceOf"]): string =>
  quote === undefined ? "" : `\n  > "${quote.text}" — ${link(evidenceOf(quote.contentItemId))}`;

function winnerLine(winner: PlanWinner, evidenceOf: PlanMarkdownInput["evidenceOf"]): string {
  const ref = evidenceOf(winner.contentItemId);
  const facts = [formatLift(winner.lift), winner.durationSec === undefined ? undefined : formatDuration(winner.durationSec), winner.hookType ? `hook: ${hookTypeLabel(winner.hookType)}` : undefined].filter(Boolean);
  const why = winner.why ? ` Neden: ${winner.why}` : winner.analyzed ? "" : winner.evidenceUnverified ? " (kanıt doğrulanamadı)" : " (henüz analiz edilmedi)";
  return `- ${link(ref)} — ${facts.join(" · ")}.${why}${quoteLine(winner.quote, evidenceOf)}`;
}

function slotLabel(at: string | undefined, zone: string, weekday: number | undefined): string {
  if (at === undefined) return "slot yok";
  const day = weekday === undefined ? "" : `${WEEKDAY_NAMES[weekday] ?? ""} `;
  return `${day}${dash(formatDateTime(at, zone))} (${zone}) / ${dash(formatDateTime(at, ISTANBUL))} (İstanbul)`;
}

function detailLines(details: IdeaDetails): string[] {
  const facts = [
    details.targetDurationSec === undefined ? undefined : `hedef süre ~${details.targetDurationSec} sn`,
    details.ctaType ? `CTA: ${details.ctaType}` : undefined,
    details.frame ? `çerçeve: ${details.frame}` : undefined,
  ].filter(Boolean);
  return facts.length === 0 ? [] : [`- Biçim: ${facts.join(" · ")}`];
}

/** Karma hesapta fikrin amacı (erişim/satış); tek amaçlı türde yazılmaz (hepsi aynı). */
function purposeLines(idea: PayloadIdea, accountType: AccountType | undefined): string[] {
  const purpose = idea.details.purpose;
  return accountType === undefined || purpose === undefined || purposeOfType(accountType) !== undefined ? [] : [`- Amaç: ${PURPOSE_LABEL[purpose]}`];
}

/** Senaryo editörü sonucu (varsa): düzeltme sayısı + yayından önce doğrulanacaklar + düzeltilen olgular (insan bakar) + hook / adımlarda kalan yanlış olgu. */
function reviewLines(idea: PayloadIdea): string[] {
  const review = idea.details.scriptReview;
  if (review === undefined) return [];
  const verify = review.verifyBeforePublish.length === 0 ? "yok" : review.verifyBeforePublish.join(" · ");
  const stillThere = claimsStillInHooksOrOutline(review, idea.hooks, idea.script_outline);
  return [
    `- Editör: ${review.corrections} düzeltme · Yayından önce doğrula: ${verify}`,
    ...correctedFactLines(review).map((line) => `- ${line}`),
    ...stillThere.map((text) => `- Dikkat: yanlış bulunan olgu hook'larda / adımlarda da geçiyor (düzeltilmedi, elle bak): "${text}"`),
  ];
}

/** Gevşek kanıt notu moda göre: rakipsiz modda rakipten söz edilmez, eşik kendi tutan eşiğidir (`LIFT_TIER_MIN`, doğrulayıcıyla aynı). */
function relaxedEvidenceLine(mode: PlanMode | undefined): string {
  const x = (lift: number): string => `≥${formatLift(lift) ?? lift}`;
  return mode === "own"
    ? `- Not: kanıtta ${x(LIFT_TIER_MIN[3])} tutan kendi video yok, en iyi kendi videon ${x(LIFT_TIER_MIN[1])} ile kabul edildi (zayıf kanıt).`
    : `- Not: kanıtta ${x(LIFT_TIER_MIN[3])} rakip yok, ${x(LIFT_TIER_MIN[2])} ile kabul edildi (zayıf kanıt).`;
}

function ideaSection(idea: PayloadIdea, input: PlanMarkdownInput): string {
  const slot = input.sections.schedule.slots.find((s) => s.position === idea.position);
  const hookTypes = idea.details.hookTypes ?? [];
  // Dil etiketi fikrin kendi `scriptLanguage`'ından ("EN", "TR"); bilinmiyorsa yazılmaz (varsayım yok).
  const languageTag = idea.details.scriptLanguage ? ` (${idea.details.scriptLanguage.toUpperCase()})` : "";
  const lines = [
    `### ${idea.position}) ${idea.title}`,
    `- Takvim: ${slotLabel(idea.slot_at, input.audienceZone, slot?.weekday)}${idea.slot_note ? ` — ${idea.slot_note}` : ""}`,
    ...(idea.brief_slot === undefined ? [] : [`- Brif slotu: ${idea.brief_slot}`]),
    `- Neden bu: ${idea.rationale}`,
    ...detailLines(idea.details),
    ...purposeLines(idea, input.accountType),
    `- Hook'lar:`,
    ...idea.hooks.map((hook, i) => `  ${i + 1}. ${hook}${hookTypes[i] ? ` _(${hookTypeLabel(hookTypes[i])})_` : ""}`),
    `- Script${languageTag}:`,
    "",
    ...(idea.details.script ?? "—").split(/\r?\n/).map((line) => `  > ${line}`),
    "",
    ...reviewLines(idea),
    `- Açıklama taslağı${languageTag}: ${(idea.details.captionDraft ?? "—").replace(/\r?\n/g, " ")}`,
    `- Kanıt:`,
    ...idea.evidence.map((e) => {
      const ref = input.evidenceOf(e.content_item_id);
      return `  - ${ref.isOwn ? "kendi" : "rakip"} ${link(ref)} — ${dash(formatLift(ref.lift))}`;
    }),
  ];
  for (const quote of idea.details.quotes ?? []) lines.push(`  > "${quote.text}" — ${link(input.evidenceOf(quote.contentItemId))}`);
  if (idea.rank_inputs.relaxedOutlier) lines.push(relaxedEvidenceLine(input.mode));
  return lines.join("\n");
}

export function renderPlanMarkdown(input: PlanMarkdownInput): string {
  const { sections } = input;
  const planned = input.ideas.filter((idea) => idea.position !== undefined);
  const candidates = input.ideas.filter((idea) => idea.position === undefined);
  const out: string[] = [];

  out.push(`# Haftalık içerik planı — ${formatDate(`${input.weekStart}T12:00:00Z`, "UTC")} haftası`);
  out.push(`Hafta başı (Pzt): ${input.weekStart} · Güven: ${CONFIDENCE_LABEL[input.confidence]} · Üretim: ${dash(formatDateTime(input.generatedAt, ISTANBUL))} (İstanbul)`);
  if (input.accountType !== undefined) {
    const profile = accountTypeProfile(input.accountType);
    out.push(`Hesap türü: ${profile.label} · Amaç: ${profile.purpose}`);
    if (purposeOfType(input.accountType) === undefined) {
      const total = planned.length > 0 ? planned.length : sections.schedule.slots.length;
      const split = splitPlanSlots(input.accountType, total);
      out.push(`Slot dağılımı: ${split.reach} erişim · ${split.sales} satış (${total} slot).`);
    }
  }
  if (input.mode !== undefined) out.push(`Plan modu: ${input.mode === "own" ? "rakipsiz — kendi tutanlarından öğrenme" : "rakip tutanlarından öğrenme"} (dayanak: ${BASIS_LABEL[input.mode]}).`);
  if (input.summary) out.push("", input.summary);

  if (input.brief !== undefined) out.push(...briefMarkdown(input.brief));
  out.push("", "## 1. Ne tuttu", "", "**Rakipler**" + (sections.winners.relaxedThreshold ? " (≥3x yeterli değildi, eşik ≥2x'e gevşetildi)" : ""));
  out.push(...(sections.winners.rivals.length === 0 ? [`- ${sections.winners.unmeasuredReason ?? "Tutan rakip içerik yok."}`] : sections.winners.rivals.map((w) => winnerLine(w, input.evidenceOf))));
  out.push("", "**Kendi videoların**");
  out.push(...(sections.winners.own.length === 0 ? ["- Son 90 günde ≥1,5x tutan kendi video yok."] : sections.winners.own.map((w) => winnerLine(w, input.evidenceOf))));

  out.push("", "## 2. Bu hafta neye yüklen", "");
  if (sections.focus.directions.length === 0) out.push(`- ${sections.focus.unmeasuredReason ?? "Yeterli veri yok."}`);
  sections.focus.directions.forEach((d, i) => {
    out.push(`${i + 1}. **${d.label}** _(${FOCUS_GROUP_LABEL[d.group]}; ${CONFIDENCE_LABEL[d.confidence]}; ${d.sampleSize} örnek; etki ${dash(formatDecimal(d.impact, 1))}; ${d.ownTried ? "daha önce denedin" : "hiç denemedin"})_`);
    if (d.rationale) out.push(`   ${d.rationale}`);
    if (d.rationaleQuote) out.push(`   > "${d.rationaleQuote.text}" — ${link(input.evidenceOf(d.rationaleQuote.contentItemId))}`);
  });

  out.push("", `## 3. İçerikler (${planned.length})`, "");
  out.push(...(planned.length === 0 ? ["- Plana giren içerik yok (fikir üretimi yetersiz kaldı)."] : planned.flatMap((idea) => [ideaSection(idea, input), ""])));

  out.push("## 4. Takvim", "", `Haftada ${sections.schedule.postsPerWeek} paylaşım (hedef kitle saati: ${sections.schedule.audienceTimeZone}).`, "");
  if (sections.schedule.slots.length === 0) out.push(`- ${sections.schedule.unmeasuredReason ?? "Slot önerilemedi."}`);
  const mixed = input.accountType !== undefined && purposeOfType(input.accountType) === undefined;
  const purposes = mixed && input.accountType !== undefined ? slotPurposes(input.accountType, sections.schedule.slots.length) : [];
  sections.schedule.slots.forEach((slot, index) => {
    const idea = planned.find((p) => p.position === slot.position);
    // Etiket atanmış fikrin kendi amacıdır (slot sırası fikir sırasından farklı olabilir); fikir yoksa ya da amacı yoksa slot yedeği.
    const slotPurpose = mixed ? (idea?.details.purpose ?? purposes[index]) : undefined;
    const purpose = slotPurpose === undefined ? "" : ` [${PURPOSE_LABEL[slotPurpose]}]`;
    out.push(`- ${slot.position}. ${slotLabel(slot.at, input.audienceZone, slot.weekday)}${purpose} — ${idea ? idea.title : "içerik atanmadı"}${slot.note ? ` _(${slot.note})_` : ""}`);
  });

  out.push("", "## 5. Kaçın", "");
  out.push(...(sections.avoid.entries.length === 0 ? ["- Belirgin kaçınılacak bir yön yok."] : sections.avoid.entries.map((e) => `- **${e.label}** — ${e.reason}`)));

  out.push("", "## 6. Geçen hafta", "", `- ${sections.review.note ?? "Yayın verisi bekleniyor."}`);

  if (candidates.length > 0) {
    out.push("", "## Adaylar (plana girmedi)", "");
    out.push(...candidates.map((idea) => `- ${idea.title}`));
  }
  if (input.voiceSummary) out.push("", "## Ses profili", "", input.voiceSummary);
  if (input.notes.length > 0) out.push("", "## Notlar", "", ...input.notes.map((note) => `- ${humanizeIds(note, input.evidenceOf)}`));
  return `${out.join("\n")}\n`;
}
