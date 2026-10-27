/**
 * Yalnız testler için ortak düzenek (üretim koduna girmez): sahte `fetch`, geçerli model çıktısı örneği, agy zarfı, izole geçici klasör.
 * Ağ ve CLI yok: alt süreç `createFakeSubprocess` (`lib/llm/subprocess-fake`), ağ ise buradaki sahte `fetch` ile taklit edilir.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { VideoAnalysisOutput } from "@/lib/video-analysis/output-schema";

export const NOW = new Date("2026-10-01T12:00:00.000Z");

/** `oe` (onaltılık unix saniyesi) içeren Instagram CDN adresi. `offsetSec` şimdiye göre (negatif = geçmiş). */
export function cdnUrl(offsetSec = 3600, host = "scontent-abc1-1.cdninstagram.com", now: Date = NOW): string {
  const oe = Math.floor(now.getTime() / 1000 + offsetSec)
    .toString(16)
    .toUpperCase();
  return `https://${host}/v/t50.2886-16/clip.mp4?_nc_sid=abc&oh=secret-token&oe=${oe}`;
}

export function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

export function videoResponse(bytes: number, headers: Record<string, string> = {}): Response {
  return new Response(streamOf([new Uint8Array(bytes).fill(7)]), { status: 200, headers: { "content-type": "video/mp4", ...headers } });
}

export function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

export interface FakeFetch {
  fetch: typeof fetch;
  /** İstek yapılan adresler (sırayla). */
  urls: string[];
  inits: (RequestInit | undefined)[];
}

/** `responder(url, n)` her istek için Response (ya da hata) üretir; `n` 0'dan başlayan istek sırasıdır. */
export function createFakeFetch(responder: (url: string, n: number, init?: RequestInit) => Response | Promise<Response>): FakeFetch {
  const urls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fake = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    inits.push(init);
    return Promise.resolve(responder(url, urls.length - 1, init));
  }) as typeof fetch;
  return { fetch: fake, urls, inits };
}

/** Geçerli bir model çıktısı (konuşma + ekran yazısı; hook konuşmanın ilk cümlesi). */
export function validOutput(overrides: Partial<VideoAnalysisOutput> = {}): VideoAnalysisOutput {
  return {
    language: "en",
    transcript: [
      { startSec: 0, endSec: 3, text: "Most people think healing takes years.", channel: "speech" },
      { startSec: 3, endSec: 7, text: "But your body can renew itself in thirty days.", channel: "speech" },
      { startSec: 7, endSec: 9, text: "Here is how.", channel: "speech" },
      { startSec: 6, text: "Comment RENEW for the guide", channel: "screen" },
    ],
    hookText: "Most people think healing takes years.",
    hookSource: "speech",
    hookType: "bold_claim",
    hookTypeEvidence: "Most people think healing takes years.",
    sections: [
      { type: "hook", quote: "Most people think healing takes years.", startSec: 0 },
      { type: "cta", quote: "Comment RENEW for the guide", startSec: 6 },
    ],
    labels: [
      { key: "topic", value: "body renewal", evidence: "your body can renew itself" },
      { key: "cta_type", value: "comment_keyword", evidence: "Comment RENEW for the guide" },
    ],
    editMetrics: { cutCount: 4, tempo: "medium", onScreenTextCount: 1, onCameraSpeaker: true, hasMusic: false, hasBurnedCaptions: false },
    ...overrides,
  };
}

/**
 * agy `--output-format json` zarfı. `real` (varsayılan) agy 1.2.14'ün gerçek çağrıda döndürdüğü biçimdir: `response` JSON metni +
 * `structured_output` nesnesi + `usage`. Diğer kipler eski/yedek biçimleri taklit eder: `fenced` (çitli metin), `plain` (çitsiz metin),
 * `object` (`response` doğrudan nesne, `structured_output` yok).
 */
export function agyEnvelope(output: unknown, mode: "real" | "fenced" | "plain" | "object" = "real"): string {
  const text = JSON.stringify(output);
  if (mode === "real") {
    return JSON.stringify({
      conversation_id: "00000000-0000-4000-8000-000000000000",
      status: "SUCCESS",
      response: text,
      duration_seconds: 99.5,
      num_turns: 1,
      structured_output: output,
      json_schema: { type: "object" },
      usage: { input_tokens: 30508, output_tokens: 23280, thinking_tokens: 22779, cache_read_tokens: 0, total_tokens: 53788 },
    });
  }
  const response = mode === "object" ? output : mode === "fenced" ? `\`\`\`json\n${text}\n\`\`\`` : text;
  return JSON.stringify({ status: "success", response });
}

/** Test başına izole üst klasör (gerçek `os.tmpdir()/vatest-*`); `cleanup` silmeyi garanti eder. */
export function makeBaseDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "vatest-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export const noSleep = (): Promise<void> => Promise.resolve();
