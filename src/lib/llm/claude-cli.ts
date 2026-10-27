/**
 * Claude CLI istemcisi: `runClaudeJson` bir görevi yerel `claude` ile çalıştırır, çıktıyı zod ile doğrular.
 *  - Kabuksuz alt süreç (`runSubprocess`); girdi stdin'den; yürütülebilir dosya `CLAUDE_CLI_PATH` ya da PATH'teki `claude`.
 *  - Araçlar, CLAUDE.md, hook, MCP, skill kapalı; cwd boş geçici klasör; oturum kaydı yok (bayraklar `claude-cli-args.ts`).
 *  - Zarf `claude-envelope.ts` ile okunur: `is_error` → `cli_failed`; yapılandırılmış çıktı (yoksa `result` metni) zod'a girer.
 *  - Düzeltme turu: şema/kod denetimi (`review`) sorun bulursa TEK kez, sorun metniyle yeniden sorulur (`--no-session-persistence`
 *    yüzünden konuşma sürmez: özgün girdi + önceki yanıt + sorun yeniden gönderilir). Yine olmazsa tipli hata (`invalid_output`).
 *  - Zaman aşımı/çıkış hatası/zarf hatası yeniden DENENMEZ (abonelik limiti ve saat boşa gitmesin; çağıran karar verir).
 * Maliyet yalnız bilgidir (`costUsd`); faturalama abonelik.
 */
import "server-only";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildClaudeArgs, toCliJsonSchema } from "@/lib/llm/claude-cli-args";
import { parseClaudeEnvelope, type ClaudeEnvelope } from "@/lib/llm/claude-envelope";
import { formatZodIssues, parseLlmJson } from "@/lib/llm/json-extract";
import { runSubprocess, SubprocessError, type SubprocessResult, type SubprocessRunner } from "@/lib/llm/subprocess";
import { LlmError, type LlmBackend, type LlmCallMeta, type LlmErrorCode, type LlmJsonRequest, type LlmJsonResult, type LlmUsage } from "@/lib/llm/types";

export const DEFAULT_TIMEOUT_MS = 180_000;
/** İlk yanıt + en çok 1 düzeltme turu. */
export const MAX_ATTEMPTS = 2;
const MAX_INPUT_CHARS = 600_000;
const MAX_PREVIOUS_ANSWER_CHARS = 60_000;
const ERROR_EXCERPT_CHARS = 300;

export interface ClaudeCliDeps {
  /** Alt süreç çalıştırıcı (testte `createFakeSubprocess().runner`). Varsayılan `runSubprocess`. */
  run?: SubprocessRunner;
  /** `CLAUDE_CLI_PATH` buradan okunur (varsayılan `process.env`). */
  env?: Record<string, string | undefined>;
  /** Yürütülebilir dosya (verilirse `CLAUDE_CLI_PATH`'i ezer). */
  executable?: string;
  /** Çağrı başına boş çalışma klasörü (varsayılan: `os.tmpdir()` altında `mkdtemp`). */
  createWorkDir?: () => Promise<string>;
  removeWorkDir?: (dir: string) => Promise<void>;
  /** İstek `model` vermezse kullanılır. */
  defaultModel?: string;
}

/**
 * Alt sürece yalnız sistem değişkenleri (`subprocess.ts` izin listesi) + bunlar geçer: abonelik girişi (`CLAUDE_CODE_OAUTH_TOKEN`), yapılandırma
 * klasörü, Windows'ta git-bash yolu. `ANTHROPIC_*` geçmez: `ANTHROPIC_API_KEY` olsaydı `claude -p` abonelik yerine API anahtarıyla çalışıp
 * ÜCRETLENİRDİ (API ile çalışma `anthropic_api` arka ucunun işidir); servis sırları da claude'a (araçları kapalı olsa da) açılmaz.
 */
const CHILD_PASS_ENV = ["CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_GIT_BASH_PATH", "CLAUDE_CONFIG_DIR"] as const;

const excerpt = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, ERROR_EXCERPT_CHARS);

function addUsage(total: LlmUsage | undefined, next: LlmUsage | undefined): LlmUsage | undefined {
  if (!next) return total;
  return { inputTokens: (total?.inputTokens ?? 0) + next.inputTokens, outputTokens: (total?.outputTokens ?? 0) + next.outputTokens };
}

/** Düzeltme turunun girdisi: özgün girdi + reddedilen yanıt + sorun metni. */
function correctionInput(input: string, previous: string, problem: string): string {
  const clipped = previous.length > MAX_PREVIOUS_ANSWER_CHARS ? `${previous.slice(0, MAX_PREVIOUS_ANSWER_CHARS)}…` : previous;
  return [
    input,
    "",
    "--- REVISION REQUEST ---",
    "Your previous answer was rejected for these problems:",
    problem,
    "",
    "Your previous answer (for reference only, it is not valid):",
    clipped,
    "",
    "Return the complete corrected answer under the same output schema and the same rules. Fix every listed problem. No commentary.",
  ].join("\n");
}

type Candidate<T> = { ok: true; value: T; raw: string } | { ok: false; problem: string; raw: string };

/** Zarftaki yanıtı şemaya karşı okur: önce `structured_output`, yoksa `result` metninden JSON ayıklanır. */
function readCandidate<T>(envelope: ClaudeEnvelope, schema: LlmJsonRequest<T>["schema"]): Candidate<T> {
  if (envelope.structured !== undefined) {
    const raw = JSON.stringify(envelope.structured);
    const parsed = schema.safeParse(envelope.structured);
    return parsed.success ? { ok: true, value: parsed.data, raw } : { ok: false, problem: `JSON şemaya uymuyor:\n${formatZodIssues(parsed.error)}`, raw };
  }
  const raw = envelope.resultText ?? "";
  const parsed = parseLlmJson(raw, schema);
  if (parsed.ok) return { ok: true, value: parsed.value, raw };
  return { ok: false, problem: parsed.issues ? `${parsed.reason}\n${parsed.issues}` : parsed.reason, raw };
}

export async function runClaudeJson<T>(request: LlmJsonRequest<T>, deps: ClaudeCliDeps = {}): Promise<LlmJsonResult<T>> {
  if (request.input.trim() === "") throw new LlmError("invalid_input", "LLM girdisi boş.");
  if (request.input.length > MAX_INPUT_CHARS) {
    throw new LlmError("invalid_input", `LLM girdisi çok büyük (${request.input.length} > ${MAX_INPUT_CHARS} karakter).`);
  }

  const model = request.model ?? deps.defaultModel;
  const args = buildClaudeArgs({ schemaJson: toCliJsonSchema(request.schema), system: request.system, model });
  const env = deps.env ?? process.env;
  const command = deps.executable ?? (env.CLAUDE_CLI_PATH?.trim() || "claude");
  const run = deps.run ?? runSubprocess;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, Math.min(request.maxAttempts ?? MAX_ATTEMPTS, MAX_ATTEMPTS));

  let attempts = 0;
  let durationMs = 0;
  let costUsd: number | undefined;
  let usage: LlmUsage | undefined;
  let reportedModel: string | undefined;

  const snapshot = (): LlmCallMeta => ({
    kind: request.task,
    backend: "claude_cli",
    billing: "subscription",
    model: reportedModel ?? model,
    durationMs,
    attempts,
    ...(costUsd === undefined ? {} : { costUsd }),
    ...(usage === undefined ? {} : { usage }),
  });
  const fail = (code: LlmErrorCode, message: string) => new LlmError(code, message, snapshot());

  /** Tek model çağrısı; her başarısızlık tipli hataya çevrilir, süre/maliyet toplamlara işlenir. */
  const callOnce = async (stdin: string, cwd: string): Promise<ClaudeEnvelope> => {
    attempts += 1;
    let result: SubprocessResult;
    try {
      result = await run({ command, args, input: stdin, timeoutMs, cwd, passEnv: CHILD_PASS_ENV });
    } catch (error) {
      if (error instanceof SubprocessError) throw fail(error.code === "spawn_failed" ? "spawn_failed" : "cli_failed", error.message);
      throw error;
    }
    durationMs += result.durationMs;
    if (result.timedOut) throw fail("timeout", `Claude CLI zaman aşımı (${Math.round(result.durationMs / 1000)} sn).`);
    if (result.truncatedStdout) throw fail("output_too_large", "Claude CLI çıktısı sınırı aştı.");

    if (result.exitCode !== 0) {
      let detail = excerpt(result.stderr);
      try {
        const failed = parseClaudeEnvelope(result.stdout);
        if (failed.resultText) detail = excerpt(failed.resultText);
      } catch {
        // zarf yok: stderr özeti yeter
      }
      throw fail("cli_failed", `Claude CLI çıkış kodu ${result.exitCode}${detail ? ` — ${detail}` : ""}`);
    }

    let envelope: ClaudeEnvelope;
    try {
      envelope = parseClaudeEnvelope(result.stdout);
    } catch (error) {
      throw error instanceof LlmError ? fail(error.code, error.message) : error;
    }
    if (envelope.costUsd !== undefined) costUsd = (costUsd ?? 0) + envelope.costUsd;
    usage = addUsage(usage, envelope.usage);
    reportedModel = envelope.model ?? reportedModel;
    if (envelope.isError) throw fail("cli_failed", `Claude CLI hata bildirdi${envelope.subtype ? ` (${envelope.subtype})` : ""}: ${excerpt(envelope.resultText ?? "")}`);
    return envelope;
  };

  const workDir = await (deps.createWorkDir ?? (() => mkdtemp(join(tmpdir(), "panel-llm-"))))();
  try {
    let stdin = request.input;
    let lastProblem = "";
    for (;;) {
      const envelope = await callOnce(stdin, workDir);
      const candidate = readCandidate(envelope, request.schema);
      const problem = candidate.ok ? request.review?.(candidate.value) : candidate.problem;

      if (problem === undefined) {
        if (!candidate.ok) throw fail("invalid_output", "Yanıt okunamadı.");
        return { value: candidate.value, meta: snapshot() };
      }
      lastProblem = problem;
      if (attempts >= maxAttempts) {
        if (candidate.ok && request.reviewFailure === "accept") return { value: candidate.value, meta: snapshot(), reviewFeedback: problem };
        throw fail("invalid_output", `Yanıt düzeltme turundan sonra da geçersiz: ${excerpt(lastProblem)}`);
      }
      stdin = correctionInput(request.input, candidate.raw, problem);
    }
  } finally {
    await (deps.removeWorkDir ?? ((dir: string) => rm(dir, { recursive: true, force: true })))(workDir).catch(() => undefined);
  }
}

/** `LlmBackend` görünümü: görevler yalnız bunu görür. */
export function createClaudeCliBackend(deps: ClaudeCliDeps = {}): LlmBackend {
  return { id: "claude_cli", runJson: (request) => runClaudeJson(request, deps) };
}
