/**
 * Yalnız testler için: `generate-ideas` testlerinin ortak sentetik verisi (uydurma içerik; gerçek Ornek/rakip verisi değil).
 */
import type { VoiceTrait } from "@/lib/domain/voice-profile";
import type { RawIdea } from "@/lib/llm/generate-ideas-schema";
import type { IdeaEvidenceContent } from "@/lib/llm/generate-ideas-validate";

export const R1_TRANSCRIPT =
  "Listen, if you keep scrolling past this, you are choosing to stay stuck. Comment FUTURE SELF and I will send you the ritual I use every single morning before anyone else wakes up.";

export const evidenceList = (over: { r1Lift?: number; r2Lift?: number } = {}): IdeaEvidenceContent[] => [
  { id: "r1", ownerHandle: "noelle", isOwn: false, lift: over.r1Lift ?? 4.2, durationSec: 92, hookType: "callout", transcript: R1_TRANSCRIPT, caption: "Your future self is waiting. #renewyourmind" },
  { id: "r2", ownerHandle: "align", isOwn: false, lift: over.r2Lift ?? 2.4, durationSec: 60, transcript: "Stop asking for signs and start asking yourself what you already know in your bones about this season." },
  { id: "r3", ownerHandle: "evelyn", isOwn: false, lift: 0.6, transcript: "Nobody talks about the ninety second rule for anger, and it quietly changes everything about your week." },
  { id: "o1", ownerHandle: "ornek", isOwn: true, lift: 1.8, durationSec: 14, transcript: "Take a breath. You are allowed to begin again, even today, even now." },
];

const trait = (key: string, verified = true): VoiceTrait => ({ key, label: `Özellik ${key}`, description: `${key} açıklaması.`, verified, examples: verified ? [{ contentItemId: "o1", quote: "You are allowed to begin again" }] : [] });

export const voice = (verifiedCount = 6) => ({
  summary: "Sıcak, doğrudan ve şefkatli.",
  language: "en",
  traits: ["direct-address", "body-wisdom", "casual-opener", "guided-breath", "faith-story", "gentle-reframe"].map((key, index) => trait(key, index < verifiedCount)),
  lexicon: { signaturePhrases: ["real talk"], avoidPhrases: ["leverage your synergy"] },
});

export const directions = [
  { group: "duration_bucket" as const, value: "60_90", label: "60–90 sn", ownTried: false, confidence: "medium" as const, rationale: "Uzun videolar tutmuş." },
  { group: "hook_type" as const, value: "callout", label: "Seslenme", ownTried: true, confidence: "low" as const },
];

export const SCRIPT =
  "Here is the thing about your mornings. Before you reach for your phone, put a hand on your chest and ask yourself one honest question: what am I actually carrying into today? Most of us never stop long enough to hear the answer. Try it tomorrow, and tell me what came up.";

export const rawIdea = (over: Partial<RawIdea> = {}): RawIdea => ({
  title: "Sabah sorusu",
  rationale: "Uzun, doğrudan seslenen videolar tutmuş; Ornek bu biçimi denemedi.",
  topic: "Sabah rutini",
  frame: "personal",
  ctaType: "comment_keyword",
  targetDurationSec: 75,
  hooks: [
    { text: "Nobody told you this about your mornings.", type: "bold_claim" },
    { text: "What if your first five minutes decide your whole day?", type: "question" },
    { text: "I used to skip this and it cost me months.", type: "confession" },
  ],
  script: SCRIPT,
  outline: ["Hook: sabah sorusu", "Hikaye: elini göğsüne koy", "CTA: yorum yaz"],
  captionDraft: "Your mornings are a quiet kind of prayer. Comment READY and I'll send you my favorite ritual. #morning #faith",
  evidenceIds: ["r1", "o1"],
  quotes: [{ contentId: "r1", text: "Comment FUTURE SELF and I will send you the ritual" }],
  voiceTraitKeys: ["direct-address"],
  directionRef: "F1",
  ...over,
});
