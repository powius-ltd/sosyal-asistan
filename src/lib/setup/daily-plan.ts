/**
 * Günlük tur planı (saf): ortam anahtarlarından hangi adımların koşacağı. Betik (`scripts/gunluk.mts`) planı uygular.
 * Adımlar: ajan turu (AGENT_AUTO açıksa) YA DA zincir (CYCLE_AUTO açıksa) · işçi (tur iş açar; kopyada onu koşturan ayrı hizmet yok, bu
 * yüzden tur bitince işçi aynı süreçten `--drain` ile koşar; kuru koşuda KOŞMAZ) · ölçüm (Zernio anahtarı varsa) · haftalık yedek.
 * Çıkış kodları: 0 tamam · 1 en az bir adım hata verdi · 2 yapılandırma eksik (ne ajan ne zincir açık, Supabase anahtarı yok).
 */
import { pathToFileURL } from "node:url";

export type DailyStep = "agent" | "cycle" | "worker" | "measure" | "backup";

export interface DailyPlan {
  steps: DailyStep[];
  notes: string[];
}

type Env = Readonly<Record<string, string | undefined>>;

const on = (env: Env, key: string): boolean => env[key]?.trim().toLowerCase() === "on";

export function hasZernioKey(env: Env): boolean {
  return Object.entries(env).some(([key, value]) => /^ZERNIO_API_KEY(_[A-Z0-9_]+)?$/.test(key) && Boolean(value?.trim()));
}

export function planDaily(env: Env, options: { dryRun: boolean }): DailyPlan {
  const steps: DailyStep[] = [];
  const notes: string[] = [];
  if (on(env, "AGENT_AUTO")) steps.push("agent");
  else if (on(env, "CYCLE_AUTO") || options.dryRun) steps.push("cycle");
  else notes.push("AGENT_AUTO ve CYCLE_AUTO kapalı: ajan turu / zincir atlandı (.env.local'a AGENT_AUTO=on yaz).");
  if (steps.length > 0 && !options.dryRun) steps.push("worker");
  if (hasZernioKey(env)) steps.push("measure");
  else notes.push("Zernio anahtarı yok: ölçüm atlandı.");
  steps.push("backup");
  return { steps, notes };
}

/** İşçiyi `node` ile başlatma argümanları (panelin `launch.ts` biçimi: tsx CLI değil yükleyici; kabuk yok, argümanlar sabit). */
export function workerNodeArgs(rootDir: string): string[] {
  const sep = rootDir.includes("\\") ? "\\" : "/";
  const loader = `${rootDir}${sep}node_modules${sep}tsx${sep}dist${sep}loader.mjs`;
  return ["--conditions=react-server", "--env-file-if-exists=.env.local", "--import", pathToFileURL(loader).href, `scripts${sep}job-worker.mts`, "--drain"];
}
