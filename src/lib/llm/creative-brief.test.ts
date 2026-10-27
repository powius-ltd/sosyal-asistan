import { describe, expect, it } from "vitest";

import { createFakeLlm } from "@/lib/llm/backend-fake";
import { createCreativeBrief, CREATIVE_BRIEF_PROMPT_VERSION } from "@/lib/llm/creative-brief";
import { BRIEF_INPUT, validRawBrief } from "@/lib/llm/creative-brief-fixtures";

describe("createCreativeBrief", () => {
  it("geçerli çıktı: tek çağrı, doğrulanmış brif; girdi ayrı veri blokları", async () => {
    const llm = createFakeLlm(validRawBrief());
    const outcome = await createCreativeBrief(llm.backend, BRIEF_INPUT);
    expect(outcome.brief?.ratio).toEqual({ adapt: 3, test: 1 });
    expect(outcome.problems).toEqual([]);
    expect(outcome.promptVersion).toBe(CREATIVE_BRIEF_PROMPT_VERSION);
    expect(outcome.meta.attempts).toBe(1);
    expect(llm.calls).toHaveLength(1);
    const stdin = llm.calls[0].input as string;
    for (const tag of ["week", "account", "niche", "directions", "cards", "anatomy", "voice", "last_week"]) expect(stdin).toContain(`<${tag}>`);
    expect(stdin).toContain('"id":"topic:c1:question"');
  });

  it("düzeltme turu: ilk çıktı denetimi geçmez, ikincisi geçer", async () => {
    const bad = validRawBrief();
    bad.slots.pop();
    const llm = createFakeLlm(bad, validRawBrief());
    const outcome = await createCreativeBrief(llm.backend, BRIEF_INPUT);
    expect(outcome.meta.attempts).toBe(2);
    expect(outcome.brief).toBeDefined();
    expect(llm.calls[1].input as string).toContain("slot sayısı 4 olmalı");
  });

  it("iki kez geçersiz → brif undefined, sebepler döner (plan brifsiz sürer)", async () => {
    const bad = validRawBrief();
    bad.theme = "Bu hafta 3 araç anlatıyoruz.";
    const llm = createFakeLlm(bad, bad);
    const outcome = await createCreativeBrief(llm.backend, BRIEF_INPUT);
    expect(outcome.brief).toBeUndefined();
    expect(outcome.problems.join("\n")).toContain("theme: belirteç dışı rakam");
    expect(outcome.meta.attempts).toBe(2);
  });
});
