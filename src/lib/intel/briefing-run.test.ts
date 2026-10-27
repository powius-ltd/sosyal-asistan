import { beforeEach, describe, expect, it, vi } from "vitest";

import { ANALYST_PROMPT_VERSION } from "@/lib/agents/analyst/prompt";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { LlmError, type LlmBackend } from "@/lib/llm/types";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";
import type { IntelContext } from "@/lib/intel/context";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const BRIEFING_ID = "22222222-2222-4222-8222-222222222222";

const runLog = vi.hoisted(() => ({
  openSubscriptionRun: vi.fn(),
  closeRun: vi.fn(),
  recordFailedLlmRun: vi.fn(),
}));
vi.mock("@/lib/intel/run-log", () => runLog);
const saveBriefing = vi.hoisted(() => vi.fn());
vi.mock("@/lib/intel/briefing-store", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/intel/briefing-store")>()), saveBriefing }));

import { runBriefing } from "@/lib/intel/briefing-run";

async function makeCtx(): Promise<IntelContext> {
  const repo = createMockRepository();
  const workspace = await repo.getWorkspace(MOCK_WORKSPACE_ID);
  if (workspace === null) throw new Error("mock workspace yok");
  return { client: {} as IntelContext["client"], repo, workspaceId: MOCK_WORKSPACE_ID, workspace, now: new Date(MOCK_NOW) };
}

/** Fake modelin gördüğü paket: stdin'deki <facts> bloğu. */
function factsIn(stdin: string): { contents: { ref: string }[]; cells: { ref: string }[] } {
  const start = stdin.indexOf("<facts>\n") + "<facts>\n".length;
  return JSON.parse(stdin.slice(start, stdin.indexOf("\n</facts>", start)));
}

const goodItem = (ref: string, patch: Record<string, unknown> = {}) => ({ kind: "changed", headline: "Analiz sayısı", body: "{g:analyzed} video analizli.", evidence: [ref], ...patch });
const modelOutput = (patch: Record<string, unknown> = {}) => (stdin: string) => ({ items: [goodItem(factsIn(stdin).contents[0].ref, patch)] });

beforeEach(() => {
  runLog.openSubscriptionRun.mockReset().mockResolvedValue({ id: RUN_ID });
  runLog.closeRun.mockReset().mockResolvedValue(undefined);
  runLog.recordFailedLlmRun.mockReset().mockResolvedValue(undefined);
  saveBriefing.mockReset().mockResolvedValue(BRIEFING_ID);
});

describe("runBriefing: başarı", () => {
  it("paketi toplar → LLM → doğrular → sayıyı yerleştirir → satırı doğrulanmış yazar → koşuyu başarılı kapatır", async () => {
    const llm = createFakeLlm(modelOutput());
    const result = await runBriefing(await makeCtx(), { llm: llm.backend });

    expect(result).toMatchObject({ ok: true, briefingId: BRIEFING_ID, runId: RUN_ID, attempts: 1, model: "claude-test" });
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].body).toMatch(/^[\d.]+ video analizli\.$/); // belirteç yerleştirildi
    expect(result.items[0].confidence).toMatch(/^(low|medium)$/); // tek video: en çok orta (kodla)

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].args).toContain("--system-prompt"); // persona + kurallar sistem isteminde
    expect(llm.calls[0].input).toContain("<facts>");

    expect(runLog.openSubscriptionRun).toHaveBeenCalledWith(expect.anything(), MOCK_WORKSPACE_ID, "claude_cli", "llm_briefing", expect.any(String));
    const row = saveBriefing.mock.calls[0][1];
    expect(row).toMatchObject({ workspace_id: MOCK_WORKSPACE_ID, agent: "analyst", run_id: RUN_ID, model: "claude-test", prompt_version: ANALYST_PROMPT_VERSION, persona_version: "persona-v1" });
    expect(row.payload).toMatchObject({ schemaVersion: 1, items: [expect.objectContaining({ body: result.items[0].body })] });
    expect(row.basis).toMatchObject({ analyzedCount: expect.any(Number), labeledCount: expect.any(Number) });
    expect(runLog.closeRun).toHaveBeenCalledWith(expect.anything(), RUN_ID, expect.objectContaining({ ok: true, itemCount: 1 }));
    expect(runLog.recordFailedLlmRun).not.toHaveBeenCalled();
  });

  it("ilk yanıtta belirteç dışı rakam varsa düzeltme turu: sorun modele geri verilir, ikinci yanıt geçerliyse yazılır", async () => {
    const llm = createFakeLlm(modelOutput({ body: "3 video analizli." }), modelOutput());
    const result = await runBriefing(await makeCtx(), { llm: llm.backend });
    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(llm.calls[1].input).toContain("REVISION REQUEST");
    expect(llm.calls[1].input).toContain("belirteç dışı rakam");
    expect(saveBriefing).toHaveBeenCalledTimes(1);
  });
});

describe("runBriefing: başarısızlıkta yazma YOK", () => {
  const expectNothingWritten = () => {
    expect(saveBriefing).not.toHaveBeenCalled();
    expect(runLog.openSubscriptionRun).not.toHaveBeenCalled();
    expect(runLog.recordFailedLlmRun).toHaveBeenCalledTimes(1);
  };

  it.each([
    ["bilinmeyen ref", modelOutput({ evidence: ["c:yok-boyle-bir-icerik"] }), "kanıt ref'i pakette yok"],
    ["bilinmeyen belirteç", modelOutput({ body: "{g:uydurma} video analizli." }), "bilinmeyen belirteç"],
    ["çarpan", modelOutput({ body: "Video 3x aldı." }), "belirteç dışı"],
    ["yüzde", modelOutput({ body: "Etkileşim %60 arttı." }), "belirteç dışı"],
    ["geçersiz eylem", modelOutput({ actionId: "run_cmd:rm-rf" }), "eylem kimliği pakette yok"],
    ["ajan güven yazdı (katı şema)", modelOutput({ confidence: "high" }), "şemaya uymuyor"],
  ])("%s: iki denemede de geçersizse invalid_output; hiçbir şey yazılmaz, başarısız koşu kaydı atılır", async (_name, output, message) => {
    const llm = createFakeLlm(output, output);
    const result = await runBriefing(await makeCtx(), { llm: llm.backend });
    expect(result).toMatchObject({ ok: false, code: "invalid_output", persistent: false });
    if (!result.ok) expect(result.message).toContain(message);
    expect(llm.calls).toHaveLength(2); // ilk yanıt + 1 düzeltme turu, fazlası yok
    expectNothingWritten();
  });

  it("kalıcı CLI hatası: persistent işareti (rutin sonraki LLM adımlarını denemez), yazma yok", async () => {
    const backend: LlmBackend = { id: "claude_cli", runJson: () => Promise.reject(new LlmError("cli_failed", "oturum yok")) };
    expect(await runBriefing(await makeCtx(), { llm: backend })).toMatchObject({ ok: false, code: "cli_failed", persistent: true });
    expectNothingWritten();
  });

  it("çağıran hatası (invalid_config) sonuca çevrilmez, fırlar", async () => {
    const backend: LlmBackend = { id: "claude_cli", runJson: () => Promise.reject(new LlmError("invalid_config", "LLM_BACKEND geçersiz")) };
    await expect(runBriefing(await makeCtx(), { llm: backend })).rejects.toMatchObject({ code: "invalid_config" });
    expect(saveBriefing).not.toHaveBeenCalled();
  });

  it("DB yazımı düşerse: koşu satırı BAŞARISIZ kapanır, sonuç write_failed (önceki brifing kalır)", async () => {
    saveBriefing.mockRejectedValueOnce(new Error("Brifing yazılamadı: bağlantı koptu"));
    const result = await runBriefing(await makeCtx(), { llm: createFakeLlm(modelOutput()).backend });
    expect(result).toMatchObject({ ok: false, code: "write_failed", persistent: false });
    expect(runLog.closeRun).toHaveBeenCalledWith(expect.anything(), RUN_ID, expect.objectContaining({ ok: false, error: expect.stringContaining("bağlantı koptu") }));
  });
});
