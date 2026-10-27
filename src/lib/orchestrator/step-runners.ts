/**
 * Tur adımı adaptörleri: notlar (`brief:now`) ve konu kümeleme sonuçlarını haftalık turun adım sonucuna çevirir (`RoutineWiring.runBriefing` /
 * `clusterOnly`). Betik (`scripts/routine.mts`) ve panel işçisi (`lib/job-runner`) AYNI çeviriyi kullanır. Koşucu parametreyle gelir: bu
 * dosya `lib/intel` koşucularını içe aktarmaz (yalnız tiplerini); testte sahtesi verilir.
 */
import type { BriefingRunResult } from "@/lib/intel/briefing-run";
import type { IntelContext } from "@/lib/intel/context";
import type { ClusterOnlyResult } from "@/lib/intel/plan-run";
import type { BriefingRunner, ClusterRunner } from "@/lib/orchestrator/steps";

type Log = (line: string) => void;

/** Notları üreten işlev (`runBriefing` imzasının kullanılan kısmı). */
export type BriefingRun = (ctx: IntelContext, options: { log: Log }) => Promise<BriefingRunResult>;
/** Konuları kümeleyen işlev (`clusterOnly` imzasının kullanılan kısmı). */
export type ClusterRun = (ctx: IntelContext, log: Log) => Promise<ClusterOnlyResult>;

/** Notlar (Analist): başarısızlık fırlatılmaz, adım sonucu olarak döner (önceki notlar ekranda kalır). */
export function briefingRunnerOf(run: BriefingRun): BriefingRunner {
  return async (c) => {
    const result = await run(c.intel, { log: c.log });
    return result.ok ? { ok: true, note: `${result.items.length} madde (${Math.round(result.seconds)} sn)` } : { ok: false, note: `${result.code}: ${result.message}` };
  };
}

/** Konu kümeleme (konu × hook matrisini doldurur): kümelenecek yeterli video yoksa tasarım gereği atlanır; hesap türü kararı `planRoutine`'dedir. */
export function clusterRunnerOf(run: ClusterRun): ClusterRunner {
  return async (c) => {
    const result = await run(c.intel, c.log);
    const note = `${result.clusters} küme, ${result.contents} içerik${result.notes.length > 0 ? ` · ${result.notes.join(" ")}` : ""}`;
    if (result.outcome === "clustered") return { ok: true, note };
    if (result.outcome === "failed") return { ok: false, note };
    return { ok: true, skipped: true, note };
  };
}
