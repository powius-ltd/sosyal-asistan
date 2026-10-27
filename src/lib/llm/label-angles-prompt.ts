/**
 * `label-angles` görevinin sistem istemi. Eksen kimlikleri, Türkçe etiketler ve katmanların zihinsel durum cümleleri
 * `domain/creative-matrix.ts`'ten ÜRETİLİR (kopya liste yok); burada yalnız her eksen değerinin kısa tarifi durur. Tarifler
 * `Record<...>` olduğu için taksonomiye yeni değer eklenirse derleme burada kırılır.
 */
import "server-only";

import { CREATIVE_ANGLE_IDS, CREATIVE_ANGLE_LABEL, CREATIVE_EVIDENCE_MAX_CHARS, FUNNEL_STAGES, type CreativeAngle, type FunnelStage } from "@/lib/domain/creative-matrix";
import { JSON_ONLY_RULE, UNTRUSTED_DATA_RULE, VERBATIM_QUOTE_RULE } from "@/lib/llm/prompt-blocks";

/** Açı = içeriğin izleyicinin zihnine hangi kapıdan girdiği. */
const ANGLE_DOOR: Record<CreativeAngle, string> = {
  "sonuc-kazanim": "the door is the outcome or gain the viewer will get (a result, a transformation, a benefit, \"how to get X\").",
  "aci-korku": "the door is a pain, fear, mistake or cost the viewer lives with or is about to hit (\"why you are stuck\", \"stop doing X\").",
  kimlik: "the door is who the viewer is or wants to be (identity, belonging, values, \"this is for women who...\", \"you are the kind of person who...\").",
  "sosyal-kanit": "the door is proof from others: a client or creator result, a testimonial, numbers, authority, \"what happened when we did X\".",
};

/** Katman kapısı: o katmandaki izleyiciye seslenen içerik neye benzer (zihinsel durumu domain verir). */
const STAGE_CUE: Record<FunnelStage, string> = {
  "hic-farkinda-degil": "the video makes the viewer notice something they had not named; no problem, solution or product is assumed.",
  "sorunu-biliyor": "the viewer already feels the problem; the video names or deepens it, without assuming a particular solution.",
  "cozum-ariyor": "the viewer knows solutions exist and is looking for the right one; the video explains a method or kind of solution.",
  "urunu-biliyor": "the viewer knows this creator's offer; the video helps them choose, answers objections or compares.",
  "sicak-musteri": "the viewer is ready to act; the video gives the next step (where, when, how to join, buy or book).",
};

export function buildLabelAnglesSystemPrompt(): string {
  const angles = CREATIVE_ANGLE_IDS.map((id) => `- ${id} (${CREATIVE_ANGLE_LABEL[id]}): ${ANGLE_DOOR[id]}`);
  const stages = FUNNEL_STAGES.map((stage) => `- ${stage.id} (${stage.name} / ${stage.label}; viewer's mindset: "${stage.mindset}"): ${STAGE_CUE[stage.id]}`);
  return [
    "You label short-form videos for a creative-matrix panel. Every video gets ONE angle (the door through which it enters the viewer's mind) and ONE awareness stage (how aware the viewer it speaks to already is). Read each item in <items> and decide from its own text only.",
    "",
    "ANGLE: pick the single door the video mainly uses. Use the id exactly.",
    ...angles,
    "",
    "AWARENESS STAGE: pick the stage of the viewer the video is made for, judged by what that viewer already knows and believes (their mindset), not by how polished the video is. Use the id exactly.",
    ...stages,
    "",
    "Each item has: id; hook_text (its opening line, a hint); transcript (spoken words, possibly clipped); screen_text (text shown on screen); caption; cta_type (a rule-based hint about the call to action, absent when unknown).",
    "",
    "Return one result per item:",
    "- id: copy the item's id exactly.",
    "- verdict: \"labeled\" when you can decide BOTH axes from the text given; \"unsure\" when you cannot (too thin, only music or emojis, ambiguous). Never guess to fill a label: thin text is a reason for \"unsure\", not for a guess.",
    "- angle, funnel_stage: only when verdict is \"labeled\".",
    `- angle_evidence: a quote from the item's own text that shows the angle (at most ${CREATIVE_EVIDENCE_MAX_CHARS} characters). Only when verdict is "labeled".`,
    `- funnel_evidence: a quote from the item's own text that shows the awareness stage (at most ${CREATIVE_EVIDENCE_MAX_CHARS} characters). Only when verdict is "labeled". Use a different line than angle_evidence when two lines show the two axes; one line is fine only when it really shows both.`,
    "",
    "Quotes come from transcript, screen_text or caption (hook_text is a copy from them). Never quote cta_type and never invent text. Quotes stay in the language they were written in.",
    VERBATIM_QUOTE_RULE,
    "Exactly one result per input item: no missing ids, no extra ids, no duplicates.",
    UNTRUSTED_DATA_RULE,
    JSON_ONLY_RULE,
  ].join("\n");
}
