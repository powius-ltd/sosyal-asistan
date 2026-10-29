import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { StudioOrder } from "@/lib/domain/studio-order";
import { ORDER_SEND_PROBLEM_PLAIN } from "@/lib/plain-language-order";
import { PRODUCE_ORDER_MISSING, produceRequestProblem } from "@/lib/job-control/produce-check";

const orderOf = (over: { status?: string; tur?: string; mod?: string }) =>
  ({ id: "o1", status: over.status ?? "taslak", ticket: { tur: over.tur ?? "broll", mod: over.mod ?? "senaryo" } }) as unknown as StudioOrder;
const repoOf = (order: StudioOrder | undefined) => ({ getStudioOrder: vi.fn().mockResolvedValue(order) });

describe("produceRequestProblem", () => {
  it("fiş yoksa düz cümle", async () => {
    expect(await produceRequestProblem(repoOf(undefined), "ws", "ornekstudyoapp", "o1")).toBe(PRODUCE_ORDER_MISSING);
  });
  it("gönderilebilir senaryolu fişte sorun yok", async () => {
    expect(await produceRequestProblem(repoOf(orderOf({})), "ws", "ornekstudyoapp", "o1")).toBeUndefined();
  });
  it("anlatım türü, UGC, stüdyosuz hesap, taslak olmayan fiş düz cümleyle reddedilir", async () => {
    expect(await produceRequestProblem(repoOf(orderOf({ tur: "anlatim" })), "ws", "ornekstudyoapp", "o1")).toBe(ORDER_SEND_PROBLEM_PLAIN.kind_narration);
    expect(await produceRequestProblem(repoOf(orderOf({ tur: "ugc" })), "ws", "ornekstudyoapp", "o1")).toBe(ORDER_SEND_PROBLEM_PLAIN.kind_ugc);
    expect(await produceRequestProblem(repoOf(orderOf({})), "ws", "ornek", "o1")).toBe(ORDER_SEND_PROBLEM_PLAIN.no_studio_account);
    expect(await produceRequestProblem(repoOf(orderOf({ status: "uretildi" })), "ws", "ornekstudyoapp", "o1")).toBe(ORDER_SEND_PROBLEM_PLAIN.not_draft);
  });
});
