/**
 * Bloklayan "koşu bitene kadar bekle" — YALNIZ yerel script ve testler içindir. Sunucu yolunda (route handler,
 * server action, cron) KULLANILMAZ: sunucu koşuyu başlatıp döner, sonucu webhook + cron başına tek `getRun`
 * çağrısı ilerletir (`docs/PLAN.md` "Port tablosu"). Bu yüzden `client.ts`'ten ayrı dosyadadır; sunucu kodu
 * bunu import etmez.
 *
 * Yerel script `server-only` yüzünden düz `tsx` ile yüklenmez: `tsx --conditions=react-server script.ts`.
 * Zaman aşımında koşuyu ABORT eder (yalnız beklemeyi bırakmaz) — kaynak `runBitmesiniBekle` sözleşmesi.
 */
import "server-only";
import { abortRun, getRun, type RunSnapshot } from "@/lib/apify/client";
import { isTerminalRunStatus } from "@/lib/apify/status";

export interface WaitForRunOptions {
  pollMs?: number;
  timeoutMs?: number;
}

export interface WaitForRunResult {
  run: RunSnapshot;
  timedOut: boolean;
}

export async function waitForRun(runId: string, options: WaitForRunOptions = {}): Promise<WaitForRunResult> {
  const pollMs = options.pollMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 300_000;
  const startedAt = Date.now();

  for (;;) {
    const run = await getRun(runId);
    if (isTerminalRunStatus(run.status)) return { run, timedOut: false };

    if (Date.now() - startedAt > timeoutMs) {
      await abortRun(runId).catch(() => undefined);
      return { run: { ...run, status: "ABORTED" }, timedOut: true };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
