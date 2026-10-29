import { describe, expect, it } from "vitest";

import { createFakeLlm } from "@/lib/llm/backend-fake";
import { reviseIdea, type ReviseIdeaInput } from "@/lib/llm/revise-idea";
import type { RawRevision } from "@/lib/llm/revise-idea-schema";
import { validateRevision, type ReviseValidationContext } from "@/lib/llm/revise-idea-validate";

const hook = (text: string, type = "question") => ({ text, type });
const revision = (over: Partial<RawRevision> = {}): RawRevision =>
  ({
    hooks: [hook("Start your morning with one honest question."), hook("Nobody tells you what the first five minutes decide."), hook("I skipped this for years and it cost me.", "confession")],
    outline: ["Quiet opening", "One idea", "Invite to try"],
    summary: "Açılışları sadeleştirdim.",
    ...over,
  }) as RawRevision;

const RIVAL = "every single morning I wake up and I remind myself that nothing is ever promised to me today";
const ctx = (over: Partial<ReviseValidationContext> = {}): ReviseValidationContext => ({
  language: "en",
  current: { hooks: ["Old hook one.", "Old hook two.", "Old hook three."], scriptOutline: ["Old a", "Old b"] },
  rivals: [{ id: "c1", text: RIVAL }],
  ...over,
});

describe("validateRevision", () => {
  it("geçerli değişiklik kabul edilir", () => expect(validateRevision(revision(), ctx())).toEqual({ ok: true }));

  it("aynı hook iki kez: reddedilir", () => {
    const dup = revision({ hooks: [hook("Same line here."), hook("Same line here."), hook("Another one entirely.")] as RawRevision["hooks"] });
    expect(validateRevision(dup, ctx())).toMatchObject({ ok: false, reason: expect.stringContaining("farklı") });
  });

  it("en içerikte Türkçe harf: reddedilir; tr içerikte kabul edilir", () => {
    const turkish = revision({ hooks: [hook("Bugün ne öğrendin?"), hook("Sabah rutinin şaşırtır."), hook("Yıllarca atladım.")] as RawRevision["hooks"] });
    expect(validateRevision(turkish, ctx({ language: "en" }))).toMatchObject({ ok: false, reason: expect.stringContaining("Türkçe harf") });
    expect(validateRevision(turkish, ctx({ language: "tr" })).ok).toBe(true);
  });

  it("rakip metninden 8+ kelimelik ortak dizi: kopya olarak reddedilir", () => {
    const copied = revision({ script: `Listen carefully. ${RIVAL.split(" ").slice(0, 9).join(" ")}. Then do the work and tell me what came out of it today.` });
    expect(validateRevision(copied, ctx())).toMatchObject({ ok: false, reason: expect.stringContaining("kopya") });
  });

  it("senaryo çok kısaysa ve içerik öncekiyle aynıysa reddedilir", () => {
    expect(validateRevision(revision({ script: "Too short script here." }), ctx())).toMatchObject({ ok: false });
    const same = revision({ hooks: ctx().current.hooks.map((t) => hook(t)) as RawRevision["hooks"], outline: [...ctx().current.scriptOutline] });
    expect(validateRevision(same, ctx())).toMatchObject({ ok: false, reason: expect.stringContaining("aynı") });
  });
});

describe("reviseIdea (model sahte alt süreç)", () => {
  const input: ReviseIdeaInput = {
    idea: { title: "Sabah rutini", rationale: "Sade başlangıç işe yarar.", hooks: ["Old hook one.", "Old hook two.", "Old hook three."], scriptOutline: ["Old a", "Old b"] },
    request: "Açılışı daha sade yap",
    language: "en",
    rivals: [],
  };

  it("geçerli yanıt: ok, abonelik çağrısı, istek ve fikir ayrı veri bloklarında", async () => {
    const llm = createFakeLlm(revision());
    const out = await reviseIdea(llm.backend, input);
    expect(out).toMatchObject({ ok: true, meta: { billing: "subscription", attempts: 1 } });
    expect(llm.calls[0]?.input).toContain("<request>");
    expect(llm.calls[0]?.input).toContain("<idea>");
  });

  it("ilk yanıt denetimden geçmezse düzeltme turu yapılır ve ikincisi kabul edilir", async () => {
    const llm = createFakeLlm(revision({ hooks: [hook("Same."), hook("Same."), hook("Other one.")] as RawRevision["hooks"] }), revision());
    const out = await reviseIdea(llm.backend, input);
    expect(out).toMatchObject({ ok: true, meta: { attempts: 2 } });
  });

  it("iki deneme de geçersizse ok:false + sebep döner (fırlatmaz)", async () => {
    const bad = revision({ hooks: [hook("Same."), hook("Same."), hook("Other one.")] as RawRevision["hooks"] });
    const out = await reviseIdea(createFakeLlm(bad, bad).backend, input);
    expect(out).toMatchObject({ ok: false, reason: expect.stringContaining("farklı") });
  });
});
