import { describe, expect, it } from "vitest";

import { handleChatRequest, type ChatHandlerDeps } from "@/lib/agents/chat/handle";
import { parseChatEvent, type ChatEvent } from "@/lib/agents/chat/events";
import { createChatLock } from "@/lib/agents/chat/lock";
import { NOOP_RUN_RECORDER } from "@/lib/agents/chat/run-record";
import type { ChatOutput } from "@/lib/agents/chat/schema";
import { factsContext, goodOutput, mockFacts } from "@/lib/agents/chat/test-support";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { loadChatWorkflow } from "@/lib/agents/chat/workflow";
import { buildChatInput, CHAT_PROMPT_VERSION } from "@/lib/agents/chat/prompt";

type Ticket = NonNullable<ChatOutput["ticket"]>;

const command = (cmd: "select_idea" | "write_ticket" | "update_ticket", ticket: Ticket): ChatOutput =>
  goodOutput({ kind: "out_of_scope", text: "Tamam, bakıyorum.", evidence: [], command: cmd, ticket });

function post(question: string): Request {
  return new Request("http://localhost:3100/api/sohbet", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3100" },
    body: JSON.stringify({ question }),
  });
}

async function run(output: ChatOutput, ctx = factsContext()): Promise<{ ctx: ReturnType<typeof factsContext>; last: ChatEvent | undefined }> {
  const deps: ChatHandlerDeps = {
    availability: () => ({ available: true }),
    getContext: async () => ctx,
    createBackend: () => createFakeLlm(output, output).backend,
    recorder: NOOP_RUN_RECORDER,
    lock: createChatLock(),
    collect: async () => mockFacts(),
    panelSlug: async () => "ornek",
  };
  const events = (await (await handleChatRequest(post("soru"), deps)).text()).split("\n").map(parseChatEvent).filter((e): e is ChatEvent => e !== undefined);
  return { ctx, last: events.at(-1) };
}

const textOf = (event: ChatEvent | undefined): string => (event?.type === "answer" ? event.text : "");

describe("sohbet fiş komutları (G6)", () => {
  it("select_idea: plandaki yeni fikir saved olur; yanıta sonuç cümlesi eklenir", async () => {
    const { ctx, last } = await run(command("select_idea", { ideaId: "id_01" }));
    expect(textOf(last)).toMatch(/fikrini seçtim/);
    expect((await ctx.repo.getIdea(ctx.workspaceId, "id_01"))?.status).toBe("saved");
  });

  it("select_idea: zaten seçili fikirde durum değişmez", async () => {
    const { ctx, last } = await run(command("select_idea", { ideaId: "id_08" }));
    expect(textOf(last)).toMatch(/zaten seçili/);
    expect((await ctx.repo.getIdea(ctx.workspaceId, "id_08"))?.status).toBe("scripted");
  });

  it("yabancı / uydurma fikir kimliği reddedilir, hiçbir şey yazılmaz", async () => {
    for (const cmd of ["select_idea", "write_ticket"] as const) {
      const { ctx, last } = await run(command(cmd, { ideaId: "id_yok_123" }));
      expect(textOf(last)).toMatch(/planında görünmüyor/);
      expect(await ctx.repo.listStudioOrders(ctx.workspaceId, {})).toHaveLength(0);
    }
  });

  it("write_ticket: fiş yazılır, tür eşlenir, bağlantı eklenir ve seçilmemiş fikir de saved olur", async () => {
    const { ctx, last } = await run(command("write_ticket", { ideaId: "id_02", kind: "ugc", note: "Mutfakta çekeceğim." }));
    const [order] = await ctx.repo.listStudioOrders(ctx.workspaceId, {});
    expect(order).toMatchObject({ ideaId: "id_02", status: "taslak" });
    expect(order?.ticket.tur).toBe("ugc");
    expect(order?.note).toContain("Mutfakta çekeceğim.");
    expect(textOf(last)).toContain(`/fis/${order?.id}`);
    expect((await ctx.repo.getIdea(ctx.workspaceId, "id_02"))?.status).toBe("saved");
  });

  it("update_ticket: 'UGC olsun' → taslak fişin türü ugc olur (fikir kimliğiyle de bulunur)", async () => {
    const ctx = factsContext();
    await run(command("write_ticket", { ideaId: "id_03" }), ctx);
    const { last } = await run(command("update_ticket", { ideaId: "id_03", kind: "ugc" }), ctx);
    const [order] = await ctx.repo.listStudioOrders(ctx.workspaceId, {});
    expect(order?.ticket.tur).toBe("ugc");
    expect(textOf(last)).toContain(`/fis/${order?.id}`);
  });

  it("update_ticket: taslak olmayan fişte reddedilir, fiş değişmez", async () => {
    const ctx = factsContext();
    await run(command("write_ticket", { ideaId: "id_04", kind: "broll" }), ctx);
    const [order] = await ctx.repo.listStudioOrders(ctx.workspaceId, {});
    // Fişi taslak dışına almak için sahte depo yanıtı: liste durumu "uretiliyor" görünür.
    const real = ctx.repo.listStudioOrders.bind(ctx.repo);
    ctx.repo.listStudioOrders = async (ws, q) => (await real(ws, q)).map((o) => ({ ...o, status: "uretiliyor" as const }));
    const { last } = await run(command("update_ticket", { orderId: order!.id, kind: "ugc" }), ctx);
    expect(textOf(last)).toMatch(/artık değiştiremem/);
    expect((await real(ctx.workspaceId, {}))[0]?.ticket.tur).toBe("broll");
  });

  it("update_ticket: yabancı fiş kimliği ve fişi olmayan fikir reddedilir", async () => {
    const a = await run(command("update_ticket", { orderId: "yok-yok", kind: "ugc" }));
    expect(textOf(a.last)).toMatch(/fişi yok|görünmüyor/);
    const b = await run(command("update_ticket", { ideaId: "id_01", kind: "ugc" }));
    expect(textOf(b.last)).toMatch(/henüz bir fişi yok/);
  });

  it("şekil doğrulaması: ticket'sız komut ve boş update_ticket modele geri döner (hata olayı)", async () => {
    const noTicket = goodOutput({ kind: "out_of_scope", text: "x", evidence: [], command: "write_ticket" });
    expect((await run(noTicket)).last?.type).toBe("error");
    expect((await run(command("update_ticket", { orderId: "o1" }))).last?.type).toBe("error");
  });
});

describe("olgu paketi ve istem sürümü", () => {
  it("<workflow> bloğu bu haftanın fikirlerini ve fişlerini taşır", async () => {
    const ctx = factsContext();
    await run(command("write_ticket", { ideaId: "id_02" }), ctx);
    const workflow = await loadChatWorkflow(ctx);
    expect(workflow.ideas.map((i) => i.id)).toContain("id_02");
    expect(workflow.tickets[0]).toMatchObject({ ideaId: "id_02", status: "taslak" });
    const input = buildChatInput(await mockFacts(), "soru", [], workflow);
    expect(input).toContain("<workflow>");
    expect(input).toContain("id_02");
  });

  it("istem sürümü artmıştır", () => {
    expect(CHAT_PROMPT_VERSION).toBe("chat-v8");
  });
});
