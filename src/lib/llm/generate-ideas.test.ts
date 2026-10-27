import { describe, expect, it } from "vitest";

import { createFakeLlm } from "@/lib/llm/backend-fake";
import { DEFAULT_IDEA_COUNT, generateIdeas, MIN_IDEAS, PROMPT_VERSION, type GenerateIdeasInput } from "@/lib/llm/generate-ideas";
import { directions, evidenceList, rawIdea, SCRIPT, voice } from "@/lib/llm/generate-ideas-fixtures";

const input = (over: Partial<GenerateIdeasInput> = {}): GenerateIdeasInput => ({
  ownerHandle: "ornek",
  language: "en",
  niche: "Faith-based coaching for women",
  directions,
  evidence: evidenceList(),
  voice: voice(),
  ...over,
});

const ideas = (n: number, over: Parameters<typeof rawIdea>[0] = {}) => Array.from({ length: n }, (_, i) => rawIdea({ title: `Fikir ${i + 1}`, ...over }));
const copied = (n: number) => ideas(n, { script: `${SCRIPT} Quick reminder: will send you the ritual I use every.` }); // r1'den 8 kelime

describe("generateIdeas", () => {
  it("geçerli 6 fikir: hepsi döner, meetsMinimum, meta kind llm_idea_generation", async () => {
    const llm = createFakeLlm({ ideas: ideas(6) });
    const out = await generateIdeas(llm.backend, input());

    expect(out.ideas).toHaveLength(6);
    expect(out.dropped).toEqual([]);
    expect(out.meetsMinimum).toBe(true);
    expect(out.promptVersion).toBe(PROMPT_VERSION);
    expect(out.meta).toMatchObject({ kind: "llm_idea_generation", backend: "claude_cli", billing: "subscription", attempts: 1 });
    expect(out.ideas[0].details.script).toBe(SCRIPT);
  });

  it("istem: yalnız doğrulanmış ses özellikleri, yön ref'leri, kanıt blokları; sistem isteminde kopya/dil kuralları", async () => {
    const llm = createFakeLlm({ ideas: ideas(6) });
    await generateIdeas(llm.backend, input({ voice: voice(6) }));

    const stdin = llm.calls[0].input as string;
    expect(stdin).toContain("<voice>");
    expect(stdin).toContain('"key":"direct-address"');
    expect(stdin).toContain('"ref":"F1"');
    expect(stdin).toContain('"id":"r1"');
    expect(stdin).toContain("leverage your synergy"); // kaçınılacak ifade modele gider

    const system = llm.calls[0].args?.join("\n") ?? "";
    expect(system).toContain(`exactly ${DEFAULT_IDEA_COUNT} ideas`);
    expect(system).toContain("8 or more consecutive words");
    expect(system).toContain("natural, conversational English");
    expect(system).not.toContain("Turkish as spoken");
    expect(system).toContain("hookType:"); // taksonomi bloğu
    expect(system).toContain("PERSONAL FACTS RULE"); // kişisel iddia koruması (v2)
    expect(PROMPT_VERSION).toBe("generate-ideas-v7+craft-v1");
  });

  it("kopya fikirler düşer: 6 üretildi, 3'ü kopya → 3 geçer, < 5 olduğu için düzeltme turu, sebep modele gösterilir", async () => {
    const mixed = [...ideas(3), ...copied(3).map((idea, i) => ({ ...idea, title: `Kopya ${i + 1}` }))];
    const llm = createFakeLlm({ ideas: mixed }, { ideas: ideas(6) });
    const out = await generateIdeas(llm.backend, input());

    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1].input).toContain("Yalnız 3 fikir kod doğrulamasından geçti");
    expect(llm.calls[1].input).toContain('"Kopya 1"');
    expect(llm.calls[1].input).toContain("kopya: r1");
    expect(out.ideas).toHaveLength(6);
    expect(out.meta.attempts).toBe(2);
  });

  it("düzeltmeden sonra da < 5 geçerse: eldekiler döner, meetsMinimum=false, düşenler sebepleriyle listelenir", async () => {
    const mixed = [...ideas(3), ...copied(3).map((idea, i) => ({ ...idea, title: `Kopya ${i + 1}` }))];
    const llm = createFakeLlm({ ideas: mixed });
    const out = await generateIdeas(llm.backend, input());

    expect(out.ideas).toHaveLength(3);
    expect(out.meetsMinimum).toBe(false);
    expect(out.dropped).toHaveLength(3);
    expect(out.dropped[0].reasons.join(" ")).toContain("kopya");
    expect(out.meta.attempts).toBe(2);
    expect(MIN_IDEAS).toBe(5);
  });

  it("≥ 5 geçerli + birkaç düşen: düzeltme turu yok (gereksiz token harcanmaz), düşenler raporda", async () => {
    const mixed = [...ideas(6), ...copied(1).map((idea) => ({ ...idea, title: "Kopya" }))];
    const llm = createFakeLlm({ ideas: mixed });
    const out = await generateIdeas(llm.backend, input());
    expect(llm.calls).toHaveLength(1);
    expect(out.ideas).toHaveLength(6);
    expect(out.dropped.map((d) => d.title)).toEqual(["Kopya"]);
  });

  it("şema: 2 hook'lu fikir (3–5 şart) şemadan geçmez → düzeltme turu", async () => {
    const twoHooks = { ...rawIdea(), hooks: rawIdea().hooks.slice(0, 2) };
    const llm = createFakeLlm({ ideas: [twoHooks] }, { ideas: ideas(5) });
    const out = await generateIdeas(llm.backend, input());
    expect(out.meta.attempts).toBe(2);
    expect(llm.calls[1].input).toMatch(/hooks/);
    expect(out.ideas).toHaveLength(5);
  });

  it("ses profili yetersizse (< 5 doğrulanmış özellik) model çağrılmaz; allowUnusableVoice ile geçilir", async () => {
    const llm = createFakeLlm({ ideas: ideas(5) });
    await expect(generateIdeas(llm.backend, input({ voice: voice(4) }))).rejects.toMatchObject({ code: "invalid_input", message: expect.stringContaining("Ses profili") });
    expect(llm.calls).toHaveLength(0);

    const out = await generateIdeas(llm.backend, input({ voice: voice(4), allowUnusableVoice: true }));
    expect(out.ideas).toHaveLength(5);
    expect(llm.calls[0].input).not.toContain('"key":"faith-story"'); // doğrulanmamış özellik script'e girmez
  });

  it("girdi doğrulaması: rakip içerik yok / yinelenen id", async () => {
    const llm = createFakeLlm({ ideas: ideas(5) });
    await expect(generateIdeas(llm.backend, input({ evidence: evidenceList().filter((c) => c.isOwn) }))).rejects.toMatchObject({ code: "invalid_input" });
    const dup = evidenceList();
    await expect(generateIdeas(llm.backend, input({ evidence: [...dup, dup[0]] }))).rejects.toMatchObject({ code: "invalid_input" });
    expect(llm.calls).toHaveLength(0);
  });

  it("istenen sayı 5–12 arasına kırpılır", async () => {
    const llm = createFakeLlm({ ideas: ideas(5) });
    await generateIdeas(llm.backend, input({ count: 2 }));
    await generateIdeas(llm.backend, input({ count: 99 }));
    expect(llm.calls[0].args?.join("\n")).toContain("exactly 5 ideas");
    expect(llm.calls[1].args?.join("\n")).toContain("exactly 12 ideas");
  });

  it("hesap sahibinin önerileri: veri bloğu + kural satırı yalnız öneri varken; kanıt kuralı değişmez", async () => {
    const withSuggestions = createFakeLlm({ ideas: ideas(6) });
    await generateIdeas(withSuggestions.backend, input({ ownerSuggestions: [{ title: "Mutfak turu", note: "Mutfağımı gezdireceğim." }] }));
    const stdin = withSuggestions.calls[0].input as string;
    expect(stdin).toContain("<owner_suggestions>");
    expect(stdin).toContain("Mutfak turu");
    expect(withSuggestions.calls[0].args?.join("\n") ?? "").toContain("NOT evidence");

    const without = createFakeLlm({ ideas: ideas(6) });
    await generateIdeas(without.backend, input({ ownerSuggestions: [] }));
    expect(without.calls[0].input as string).not.toContain("owner_suggestions");
    expect(without.calls[0].args?.join("\n") ?? "").not.toContain("owner_suggestions");
  });
});
