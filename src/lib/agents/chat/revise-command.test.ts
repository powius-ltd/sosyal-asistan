/** Sohbetle fikir düzeltme (SPN-35 G4): model ÖNERİR, sunucu kimliği plandan doğrular, yeniden yazım ikinci çağrıdır; sohbet planı onaylamaz. */
import { describe, expect, it } from "vitest";

import { CHAT_PROMPT_VERSION, buildChatSystemPrompt } from "@/lib/agents/chat/prompt";
import { parseChatEvent, type ChatEvent } from "@/lib/agents/chat/events";
import { handleChatRequest, type ChatHandlerDeps } from "@/lib/agents/chat/handle";
import { createChatLock } from "@/lib/agents/chat/lock";
import { NOOP_RUN_RECORDER, type ChatRunRecorder } from "@/lib/agents/chat/run-record";
import type { ChatOutput } from "@/lib/agents/chat/schema";
import { verifyChatOutput } from "@/lib/agents/chat/verify";
import { factsContext, goodOutput, mockFacts } from "@/lib/agents/chat/test-support";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { REVISE_PLAIN } from "@/lib/plain-language-revise";

const command = (revision: ChatOutput["revision"]): ChatOutput => goodOutput({ kind: "out_of_scope", text: "Tamam, açılışı yeniden yazıyorum.", evidence: [], command: "revise_idea", revision });
const rewritten = {
  hooks: [
    { text: "Bu sabah rutinini bir hafta dene.", type: "question" },
    { text: "Kimse sana ilk beş dakikanın önemini anlatmadı.", type: "bold_claim" },
    { text: "Ben bunu yıllarca atladım.", type: "confession" },
  ],
  outline: ["Sade bir açılış", "Tek fikri anlat", "Denemeye çağır"],
  summary: "Açılışları daha sade yazdım.",
};

function post(question: string): Request {
  return new Request("http://localhost:3100/api/sohbet", { method: "POST", headers: { "content-type": "application/json", host: "localhost:3100" }, body: JSON.stringify({ question }) });
}

async function run(chat: ChatOutput, revise: unknown = rewritten, recorder: ChatRunRecorder = NOOP_RUN_RECORDER) {
  const ctx = factsContext();
  const backends = [createFakeLlm(chat, chat), createFakeLlm(revise, revise)];
  let next = 0;
  const deps: ChatHandlerDeps = {
    availability: () => ({ available: true }),
    getContext: async () => ctx,
    createBackend: () => backends[Math.min(next++, 1)]!.backend,
    recorder,
    lock: createChatLock(),
    collect: async () => mockFacts(),
  };
  const events = (await (await handleChatRequest(post("açılışı sadeleştir"), deps)).text()).split("\n").map(parseChatEvent).filter((e): e is ChatEvent => e !== undefined);
  const last = events.at(-1);
  return { ctx, text: last?.type === "answer" ? last.text : "", reviseCalls: backends[1]!.calls.length };
}

describe("sohbet revise_idea (G4)", () => {
  it("plandaki fikir değişir: yeni açılışlar yazılır, eski hâl saklanır, yanıta sonuç cümlesi eklenir, ikinci çağrı kaydedilir", async () => {
    const recorded: string[] = [];
    const recorder: ChatRunRecorder = { succeeded: async (_ws, meta) => void recorded.push(meta.kind), failed: async () => undefined };
    const ctx0 = factsContext();
    const before = await ctx0.repo.getIdea(ctx0.workspaceId, "id_01");
    expect(before).not.toBeNull();
    const { ctx, text } = await run(command({ ideaId: "id_01", request: "Açılışı daha sade yap" }), rewritten, recorder);
    expect(text).toContain("Açılışları daha sade yazdım.");
    const after = await ctx.repo.getIdea(ctx.workspaceId, "id_01");
    expect(after?.hooks).toEqual(rewritten.hooks.map((h) => h.text));
    expect(after?.details.revisions?.[0]?.request).toBe("Açılışı daha sade yap");
    expect(recorded).toEqual(["llm_chat", "llm_chat"]);
  });

  it("yabancı / uydurma fikir kimliği reddedilir: model ikinci kez çağrılmaz, hiçbir şey yazılmaz", async () => {
    const { text, reviseCalls } = await run(command({ ideaId: "id_yok_123", request: "x" }));
    expect(text).toContain(REVISE_PLAIN.notInPlan);
    expect(reviseCalls).toBe(0);
  });

  it("yeniden yazım denetimden geçmezse fikir değişmez ve sebep düz Türkçe söylenir", async () => {
    const dup = { ...rewritten, hooks: [rewritten.hooks[0], rewritten.hooks[0], rewritten.hooks[1]] };
    const { ctx, text } = await run(command({ ideaId: "id_01", request: "x" }), dup);
    expect(text).toContain(REVISE_PLAIN.rejected);
    expect((await ctx.repo.getIdea(ctx.workspaceId, "id_01"))?.details.revisions).toBeUndefined();
  });

  it("şekil kuralı: revise_idea revision ister, revision yalnız revise_idea ile verilir", async () => {
    const facts = await mockFacts();
    const without = goodOutput({ kind: "out_of_scope", text: "Tamam.", evidence: [], command: "revise_idea" });
    expect(verifyChatOutput(without, facts).join(" ")).toContain("revision");
    const stray = goodOutput({ kind: "out_of_scope", text: "Tamam.", evidence: [], revision: { ideaId: "id_01", request: "x" } });
    expect(verifyChatOutput(stray, facts).join(" ")).toContain("revision yalnız");
    expect(verifyChatOutput(command({ ideaId: "id_01", request: "x" }), facts)).toEqual([]);
  });

  it("istem: sürüm chat-v9; düzeltme komutu anlatılır ve sohbet planı onaylayamaz", () => {
    expect(CHAT_PROMPT_VERSION).toBe("chat-v9");
    const prompt = buildChatSystemPrompt("business");
    expect(prompt).toContain("revise_idea");
    expect(prompt).toContain("NEVER approve the plan");
  });
});
