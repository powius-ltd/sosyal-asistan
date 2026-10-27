import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createFakeLlm } from "@/lib/llm/backend-fake";
import { craftBlocks, CRAFT_BLOCKS_VERSION, HOOK_CRAFT_RULE, RETENTION_RULE, SPOKEN_TURKISH_RULE } from "@/lib/llm/craft-blocks";
import { generateIdeas, PROMPT_VERSION, type GenerateIdeasInput } from "@/lib/llm/generate-ideas";
import { SCRIPT_REVIEW_PROMPT_VERSION } from "@/lib/llm/script-review";
import { directions, evidenceList, rawIdea, voice } from "@/lib/llm/generate-ideas-fixtures";

const input = (language: GenerateIdeasInput["language"]): GenerateIdeasInput => ({ ownerHandle: "hesap", language, directions, evidence: evidenceList(), voice: voice() });
const systemOf = async (language: GenerateIdeasInput["language"]): Promise<string> => {
  const llm = createFakeLlm({ ideas: Array.from({ length: 6 }, (_, i) => rawIdea({ title: `Fikir ${i + 1}` })) });
  await generateIdeas(llm.backend, input(language));
  return llm.calls[0].args?.join("\n") ?? "";
};

describe("craftBlocks", () => {
  it("tr: hook + izletme + konuşma Türkçesi; en: yalnız ilk ikisi", () => {
    expect(craftBlocks("tr")).toEqual([HOOK_CRAFT_RULE, RETENTION_RULE, SPOKEN_TURKISH_RULE]);
    expect(craftBlocks("en")).toEqual([HOOK_CRAFT_RULE, RETENTION_RULE]);
    expect(CRAFT_BLOCKS_VERSION).toMatch(/^craft-v\d+$/);
  });

  it("blok metni sürüme sabitlenir (B8): metin değişirse CRAFT_BLOCKS_VERSION artırılır, bu özet güncellenir", () => {
    const digest = createHash("sha256").update([HOOK_CRAFT_RULE, RETENTION_RULE, SPOKEN_TURKISH_RULE].join("\n")).digest("hex").slice(0, 16);
    expect({ version: CRAFT_BLOCKS_VERSION, digest }).toEqual({ version: "craft-v1", digest: "c337fbc439e26b4a" });
  });

  it("istem sürümleri zanaat sürümünü taşır (blok değişince istem sürümü de değişir)", () => {
    expect(PROMPT_VERSION).toContain(CRAFT_BLOCKS_VERSION);
    expect(SCRIPT_REVIEW_PROMPT_VERSION).toContain(CRAFT_BLOCKS_VERSION);
  });
});

describe("generateIdeas: zanaat blokları istemde", () => {
  it("tr istemde üç blok", async () => {
    const system = await systemOf("tr");
    for (const rule of [HOOK_CRAFT_RULE, RETENTION_RULE, SPOKEN_TURKISH_RULE]) expect(system).toContain(rule);
  });

  it("en istemde konuşma Türkçesi yok, hook ve izletme var; kişisel olgu kuralı korunur; sürüm v6 + zanaat sürümü", async () => {
    const system = await systemOf("en");
    expect(system).toContain(HOOK_CRAFT_RULE);
    expect(system).toContain(RETENTION_RULE);
    expect(system).not.toContain("SPOKEN TURKISH");
    expect(system).toContain("PERSONAL FACTS RULE");
    expect(PROMPT_VERSION).toBe("generate-ideas-v7+craft-v1");
  });
});
