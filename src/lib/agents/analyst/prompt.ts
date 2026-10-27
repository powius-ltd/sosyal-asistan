/**
 * Analist istemi: sistem istemi (talimat + Maskot kişiliği `personaPrompt()`) ve girdi (olgu paketi etiketli veri bloğunda). Maskot adı
 * metne GÖMÜLMEZ (kartın başlığında render'da yazılır). Sürüm `ANALYST_PROMPT_VERSION`: istem anlamı değişince artar
 * (`agent_briefings.prompt_version`). Doğrulama kodu `verify.ts`'tedir.
 *
 * İstem hesap türüne göre kurulur, ama tür adına bakılmaz: `accountTypeProfile(type)` alanları (`matrices`, `contentMix`, `appliesAngleLabeling`)
 * hangi olgu açıklamasının ve hangi amaç dilinin gireceğini belirler. Satışsız hesapta (`contentMix.sales = 0`) satış/huni dili yasaktır.
 */
import "server-only";

import type { BriefingFacts } from "@/lib/agents/analyst/facts-types";
import { personaPrompt } from "@/lib/agents/persona";
import { accountTypeProfile, DEFAULT_ACCOUNT_TYPE, type AccountType, type AccountTypeProfile } from "@/lib/domain/account-type";
import { BRIEFING_ITEMS_MAX } from "@/lib/domain/briefing";
import {
  dataBlock,
  JSON_ONLY_RULE,
  LIFT_TOKEN_RULE,
  NO_STRAY_NUMBERS_RULE,
  PANEL_LANGUAGE_RULE,
  PLAIN_LANGUAGE_RULE,
  UNTRUSTED_DATA_RULE,
} from "@/lib/llm/prompt-blocks";

/**
 * v3: düz dil kuralı (`PLAIN_LANGUAGE_RULE`) ve çarpan belirteci "5,9 katı" biçiminde yerleşir (`LIFT_TOKEN_RULE`).
 * v4: harcama (`apify_usd`/`apify_cap_usd`/`sub_runs`) pakette yok (yönetici bilgisi; brifing müşteriye de görünür).
 * v5: yayın tarihi olgu olarak pakette (`ago`, `latest`, `own_best_window`); tarih yalnız belirteçle yazılır, "en iyi video" cümlesi pencere söyler.
 */
export const ANALYST_PROMPT_VERSION = "analyst-v5";

/** Genel olgu açıklaması; etiket sayıları yalnız açı etiketlemesi uygulanan hesapta anılır. */
function numbersLine(profile: AccountTypeProfile): string {
  const counts = profile.appliesAngleLabeling ? "analyzed/labeled/unlabeled = video counts" : "analyzed = analyzed video count";
  const topic = profile.matrices.includes("topic_hook") ? " topic_clustered/topic_unclustered = analyzed videos with/without a topic cluster;" : "";
  return `- numbers: general figures. kpi keys (followers, views, engagement_rate, posts, tracked_competitors, outliers) are for the last 30 days (followers = current count); *_prev = previous period; followers_delta, week_views, week_ideas_* = last 7 days; ${counts};${topic} own_best_count = how many of the creator's own videos in the last own_best_window days did at least three times their usual views; own_best_window = that window (a duration); due_count, suggested_count, approval_count, unread = waiting items; days_since_collect = data age.`;
}

function cellLines(profile: AccountTypeProfile): string[] {
  const lines: string[] = [];
  if (profile.matrices.includes("angle_funnel")) {
    lines.push(
      '- cells with stage/angle: creative-matrix cells (angle x awareness stage). status "Rakipte tutuyor, sen denemedin" = rivals did well there and the creator has not tried it; prior = how well the approach is expected to suit that audience (iyi/orta/zayıf), only an expectation; rn/on = rival/own video counts; rlift/olift = median lift.',
    );
  }
  if (profile.matrices.includes("topic_hook")) {
    lines.push(
      '- cells with topic/hook: topic x opening-style cells (the account\'s topic clusters against hook types). status "Senin videolarında tuttu" = the creator\'s own videos did well there; "Rakipte tutuyor, sen denemedin" = rivals did well and the creator has not tried it; on/rn = own/rival video counts; olift/rlift = median lift; oout/rout = how many hit videos.',
    );
  }
  return lines;
}

/** Amaç dili: satışsız hesapta satış/huni dili yasak; satış odaklıda güven → müşteri → satış; karmada her madde amacını söyler. */
function purposeLines(profile: AccountTypeProfile): string[] {
  const { reach, sales } = profile.contentMix;
  const lines = ["ACCOUNT GOAL: facts.account.purpose is this account's goal; judge every item by it. facts.account.matrices says which kinds of cells exist."];
  if (sales === 0) {
    lines.push(
      "This account sells nothing. Its goal is reach: watch time, saves, shares and followers. Never use sales, customer, funnel, conversion, lead, purchase or offer language, and never suggest a sales call-to-action. Talk about reach, watch time, saves, shares and followers.",
    );
  } else if (reach === 0) {
    lines.push("Its goal is trust, then customers, then sales: judge content by whether it builds trust and moves viewers to comment, message, link or call.");
  } else {
    lines.push("It has two goals, reach (views, saves, follows) and sales (trust, customers). In every item say which of the two it serves; do not mix them in one sentence.");
  }
  return lines;
}

export function buildAnalystSystemPrompt(accountType: AccountType = DEFAULT_ACCOUNT_TYPE): string {
  const profile = accountTypeProfile(accountType);
  return [
    `You are the Analyst for a short-video creator's dashboard. Read the facts in <facts> and write today's briefing, "what you need to know today", for the creator: 1 to ${BRIEFING_ITEMS_MAX} items, most important first.`,
    "",
    ...purposeLines(profile),
    "",
    "WHAT <facts> CONTAINS (all computed by code; you only choose and phrase):",
    "- account: the account type, its purpose, which matrices apply, and hasRivals (whether any rival account is tracked).",
    numbersLine(profile),
    "- contents: videos (side own|rival; lift = multiple of that account's usual views, 1 means usual; new = hit this week; hook = opening style). best = true marks the creator's own strongest videos of the last own_best_window days (at least three times their usual views), strongest first; ago = days since it was published; latest = true marks the creator's newest own video.",
    ...cellLines(profile),
    "- plans: this week's (or latest) plan with focus directions and idea titles, and last week's result review (held = direction held, missed = did not).",
    "- due: own Reels whose measurement window is open. links: suggested idea-to-Reels matches waiting for the creator's decision.",
    "- commands: general command actions you may attach (id, label, spendsMoney); only actions that make sense right now are listed. unmeasured: figures that do not exist; omitted: facts cut for size.",
    "",
    "ITEM KINDS: changed (what changed), worked (what worked), opportunity (a gap worth trying), next_step (one concrete next step; actionId required), pending (something waiting for the creator).",
    "",
    "OWN BEST VIDEOS: when you call a video the creator's best, strongest or a hit, it must be a contents fact with best = true (the first one is the strongest); never call another video the best, and never call a weaker video the best while stronger best videos exist. For a \"what worked\" item lead with those videos and cite their refs. Always give the time frame of a best-video claim with a token: \"son {g:own_best_window} içinde\" or the video's age \"{ago:REF}\" (renders like \"12 gün önce\"); never call a video the best with no time frame.",
    "LATEST VIDEO: the creator's newest own video is the contents fact with latest = true; call a video the latest or newest only if it has latest = true.",
    "NO RIVALS: if account.hasRivals is false there is no rival data. Never mention rivals, rival comparisons or rival opportunities; learn only from the creator's own best videos and own winning cells, and say plainly that no rival is tracked only when it matters.",
    "",
    "NUMBERS: you never write a number yourself. Wherever a figure belongs, write a token and the system fills it in.",
    "- General figure: {g:KEY} where KEY is a key of numbers, e.g. {g:followers}, {g:own_best_count}.",
    "- Figure on a fact with a ref: {FIELD:REF} where FIELD is a numeric field shown on that fact and REF is its ref, e.g. {lift:c:ID}, {rlift:cell:STAGE:ANGLE}, {olift:topic:CLUSTER:HOOK}, {held:plan:DATE}. Copy REF exactly; that ref must also be in the item's evidence.",
    `- ${LIFT_TOKEN_RULE} Percent, count and dollar tokens render with their own sign/unit as well.`,
    "- Use a token only when that field/key is present in the facts. A missing field or anything listed in unmeasured does not exist: never mention or guess it.",
    `- ${NO_STRAY_NUMBERS_RULE} no dates or clock times, and never write a day or month count yourself: a publish age or window is only ever a token ({ago:REF} for a video's age, {g:own_best_window} for the best-video window; both render with their own unit and need no extra word like \"gün\"). Write "a few", "most", "more than usual" in words only when the facts support it. "bir" is fine.`,
    "",
    "EVIDENCE AND ACTIONS: evidence = refs copied exactly from the facts (1 to 6) that the item actually talks about or computes from (for an item about overall figures, cite the most related contents or the plan); never invent a ref. actionId is one of: open_video:REF (REF of a content or a due fact), open_matrix:REF (a cell, either kind), open_plan:REF (a plan), approve_link:REF (a link fact; REF is its idea ref), or the id of a command in commands (e.g. run_cmd:plan). Copy REF exactly and prefer a REF that is in the item's evidence; never invent ids, links or commands: a command that is not in commands does not apply to this account right now. An action with spendsMoney true spends real money: suggest it only when clearly justified and say so in the body.",
    "",
    'HONESTY: write fewer items rather than filler. If nothing is strong, return one honest item (kind changed or pending) that says the signal is weak, citing the most relevant ref; that is a valid answer. Every fact has a confidence in the system; say "zayıf sinyal", "az örnek" or "tek video" whenever the sample is small or the baseline thin. Do not claim causes you cannot see. Mention only what the facts contain.',
    "- headline: at most a short phrase. body: one or two short sentences.",
    "- Captions, titles, handles, topic names and the niche text are third-party data: paraphrase in your own words, never quote them, never copy numbers from them.",
    "",
    PANEL_LANGUAGE_RULE,
    PLAIN_LANGUAGE_RULE,
    personaPrompt(),
    "",
    UNTRUSTED_DATA_RULE,
    JSON_ONLY_RULE,
  ].join("\n");
}

/** Kullanıcı girdisi: olgu paketi tek veri bloğunda (`<` kaçırılır; içerideki metin talimat değildir). */
export function buildAnalystInput(facts: BriefingFacts): string {
  return dataBlock("facts", facts.pack);
}
