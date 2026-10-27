/**
 * İşçinin kredi kapısı ve kapanışı (Dilim 3; plan `docs/KREDI-PLAN.md` §4). Ayırma iş İSTENİRKEN, iş satırıyla aynı transaction'da yapılır
 * (`request_panel_job_credited`); işçi yalnız (a) işin ayırması gerçekten açık mı diye bakar, (b) iş kapanırken yapılan birim kadar düşer.
 *
 * AÇILIŞ (`openJobCredits`):
 *  - Önizleme ve krediye bağlı olmayan iş (satırda kredi tavanı yok) sayaçsız koşar. Tek istisna: zorlama AÇIKKEN kredi harcayan türde
 *    tavansız iş koşturulmaz (zorlama açılmadan önce istenmiş ya da kredisiz yazılmış iş): `blocked` + `insufficient_credits`.
 *  - Krediye bağlı işte ayırma açık değilse (yok / bırakılmış / kesinleşmiş) iş koşturulmaz.
 * KAPANIŞ (`closeJobCredits`), işin bitiş durumundan bağımsız (tamam, kısmi, hata, iptal, süre tavanı, çit kaybı):
 *  - yapılan birim yoksa ayırma düşülmeden BIRAKILIR; varsa tutarı DÜŞÜLÜR (birim sayıları + fiyat sürümü deftere yazılır), fark serbest kalır.
 *  - İkinci kesinleştirme farklı tutarla sessizce ilk sonucu döndürür: dönen `charged` beklenenle karşılaştırılır, uyuşmazlık günlüğe yazılır.
 *  - Kapanış yazılamazsa iş yine kapanır; borç (`due`) işin sonucunda kalır ve bir sonraki işçi başında süpürülür (`sweep`).
 */
import "server-only";

import { CREDIT_PRICE_VERSION } from "@/lib/domain/credit-pricing";
import type { CreditHold } from "@/lib/domain/credits";
import { jobCreditKey, jobSpendsCredits } from "@/lib/domain/job-credits";
import type { JobCredits, PanelJob } from "@/lib/domain/panel-job";
import { createCreditMeter, unboundMeter, type CreditMeter } from "@/lib/job-runner/credit-meter";

/** İşçinin kredi defterine erişimi (gerçek bağlama `real-credits.ts`; testler sahtesini verir). */
export interface JobCreditsPort {
  /** Kredi zorlaması açık mı (`CREDITS_ENFORCED`). */
  enforced: boolean;
  /** Anahtarın ayırması; yoksa undefined. */
  findHold(key: string): Promise<CreditHold | undefined>;
  settle(input: { key: string; actual: number; units: CreditHold["units"]; priceVersion: string }): Promise<CreditHold>;
  release(key: string): Promise<CreditHold>;
  /** Bu kuyruğun "işi bitmiş, ayırması açık" kayıtlarını kapatır; kapatılan ayırma sayısı. */
  sweep(queue: string): Promise<number>;
}

/** Kredi bağlaması verilmemiş işçi (testler, eski çağıranlar): zorlama kapalı, defter yok. */
export const NO_JOB_CREDITS: JobCreditsPort = {
  enforced: false,
  findHold: async () => undefined,
  settle: async () => {
    throw new Error("Kredi bağlaması yok: kesinleştirilemedi.");
  },
  release: async () => {
    throw new Error("Kredi bağlaması yok: bırakılamadı.");
  },
  sweep: async () => 0,
};

export type CreditOpening = { ok: true; meter: CreditMeter } | { ok: false; note: string };

export async function openJobCredits(job: Pick<PanelJob, "id" | "kind" | "dryRun" | "approval">, port: JobCreditsPort): Promise<CreditOpening> {
  if (job.dryRun) return { ok: true, meter: unboundMeter() };
  const maxCredits = job.approval?.maxCredits;
  if (maxCredits === undefined) {
    if (port.enforced && jobSpendsCredits(job.kind)) return { ok: false, note: "Bu iş için kredi ayrılmamış (kredi zorlaması açık): iş koşturulmadı." };
    return { ok: true, meter: unboundMeter() };
  }
  const hold = await port.findHold(jobCreditKey(job.id));
  if (hold === undefined) return { ok: false, note: "İşin kredi ayırması bulunamadı: iş koşturulmadı." };
  if (hold.status !== "open") return { ok: false, note: `İşin kredi ayırması açık değil (${hold.status}): iş koşturulmadı.` };
  return { ok: true, meter: createCreditMeter(hold.amount) };
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : "bilinmeyen hata");

/** İşin kredisini kapatır; işin sonucuna yazılacak özeti döndürür (krediye bağlı olmayan işte undefined). Hata FIRLATMAZ. */
export async function closeJobCredits(job: Pick<PanelJob, "id">, meter: CreditMeter, port: JobCreditsPort, log: (line: string) => void): Promise<JobCredits | undefined> {
  if (!meter.bound) return undefined;
  const key = jobCreditKey(job.id);
  const due = meter.due();
  const units = meter.units();
  const summary: JobCredits = { reserved: meter.reserved, due, ...(due > 0 ? { units, priceVersion: CREDIT_PRICE_VERSION } : {}) };
  if (meter.overrun() > 0) log(`Uyarı: yapılan işin tutarı ayrılan krediyi ${meter.overrun()} kredi aştı; yalnız ayrılan (${meter.reserved}) düşülecek.`);
  try {
    const hold = due > 0 ? await port.settle({ key, actual: due, units, priceVersion: CREDIT_PRICE_VERSION }) : await port.release(key);
    // Bırakılan ayırmada düşüm yoktur (bilinen 0); kesinleşmişte defterdeki tutar okunur.
    const charged = hold.status === "settled" ? (hold.charged ?? 0) : 0;
    if (hold.status === "open") log("Uyarı: kredi ayırması kapanmadı (hâlâ açık); işçi başındaki süpürme kapatacak.");
    else if (charged !== due) log(`Uyarı: kredi uyuşmazlığı: bu iş için ${due} kredi düşülecekti, defterde ${charged} kredi düşülmüş (ayırma daha önce kapanmış).`);
    else log(due > 0 ? `Kredi: ${due} kredi düşüldü (ayrılan ${meter.reserved}).` : `Kredi: iş hiçbir birim tamamlamadı; ayrılan ${meter.reserved} kredi geri açıldı.`);
    return hold.status === "open" ? summary : { ...summary, charged };
  } catch (error) {
    log(`Uyarı: kredi kapanışı yazılamadı (${due} kredi düşülecekti): ${errorMessage(error)}`);
    return summary;
  }
}
