/** "Prompt olarak kopyala": saf prompt kurucuları + alan modeli çevirileri. Kullanım: `app/actions/prompt.ts`. */
export { buildContentPrompt } from "@/lib/prompt/build-content-prompt";
export { buildIdeaPrompt } from "@/lib/prompt/build-idea-prompt";
export { ideaForPrompt, videoFromDetail, videoFromEvidence } from "@/lib/prompt/from-domain";
export { MAX_EVIDENCE_VIDEOS, PROMPT_MAX_CHARS, TRANSCRIPT_MAX_CHARS } from "@/lib/prompt/limits";
export { PROMPT_LANGUAGES } from "@/lib/prompt/types";
export type {
  ContentPromptInput,
  IdeaPromptInput,
  PromptIdea,
  PromptLanguage,
  PromptTranscript,
  PromptVideo,
} from "@/lib/prompt/types";
