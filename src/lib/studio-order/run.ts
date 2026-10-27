/**
 * Fiş yazımının tek giriş noktası: betik (`scripts/siparis-yaz.mts`) ve panel işçisi (`order` işi) AYNI işlevi çağırır. Planı okur,
 * her plan öğesi için `buildTicket`, fişi `<klasör>/<hesap>/<hafta>/<siparis_id>.md` olarak YAZAR; var olan fişin üstüne YAZMAZ (atlar).
 * Salt okunur veri + yerel dosya: dış servis çağrısı, para yok. Stüdyoda tanımlı olmayan hesapta açık hata (`StudioAccountError`).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { PanelRepository } from "@/lib/data/repository";
import type { DurationBucket } from "@/lib/domain/taxonomy";
import type { LiftGroupStat } from "@/lib/domain/insights";
import { orderRootOf } from "@/lib/studio-order/order-root";
import { buildTicket, type EvidenceVideo } from "@/lib/studio-order/build";
import { studioAccountOf } from "@/lib/studio-order/accounts";
import { writeTicket } from "@/lib/studio-order/ticket-file";

/** Varsayılan sipariş klasörü (ortamdan çözülür: `SIPARIS_KOK`, kopyada repo içi `siparisler/`, yoksa `/opt/panel/siparisler`). */
export const DEFAULT_ORDERS_DIR = orderRootOf();

export interface OrderRunOptions {
  repo: PanelRepository;
  workspaceId: string;
  workspaceSlug: string | undefined;
  /** Planın haftası (Pazartesi, YYYY-AA-GG). */
  week: string;
  /** Yalnız bu slot (örn. S1, P2). */
  slot?: string;
  /** Yalnız bu fikir. */
  ideaId?: string;
  ordersDir: string;
  /** Yazma, yalnız ne yazılacağını söyle. */
  dryRun?: boolean;
  /** Yazılan fişleri klasörün kendi git'ine commit'le (klasör git deposuysa). */
  commit?: boolean;
  log?: (line: string) => void;
}

export interface OrderRunResult {
  written: { orderId: string; path: string }[];
  /** `exists`: aynı kimlikli fiş var, dokunulmadı. Diğerleri: fiş kurulamadı (sebep metni). */
  skipped: { orderId?: string; slot?: string; reason: string }[];
  planFound: boolean;
}

export async function loadEvidence(repo: PanelRepository, workspaceId: string, ids: readonly string[], cache: Map<string, EvidenceVideo | null>): Promise<EvidenceVideo[]> {
  const out: EvidenceVideo[] = [];
  for (const id of ids) {
    if (!cache.has(id)) {
      const detail = await repo.getContent(workspaceId, id);
      cache.set(
        id,
        detail === null
          ? null
          : {
              contentItemId: id,
              ...(detail.item.url ? { url: detail.item.url } : {}),
              ownerKind: detail.item.owner.kind,
              ...(detail.item.durationSec !== undefined ? { durationSec: detail.item.durationSec } : {}),
              ...(detail.analysis ? { analysis: detail.analysis } : {}),
            },
      );
    }
    const found = cache.get(id);
    if (found) out.push(found);
  }
  return out;
}

export async function ownDurationGroups(repo: PanelRepository, workspaceId: string): Promise<LiftGroupStat<DurationBucket>[]> {
  try {
    return (await repo.getInsights(workspaceId)).durationBuckets.own;
  } catch {
    return []; // süre grubu yardımcı bilgidir; okunamazsa öneri rakip / plan kaynağından sürer
  }
}

function commitTickets(ordersDir: string, paths: readonly string[], week: string, log: (line: string) => void): void {
  if (paths.length === 0 || !existsSync(join(ordersDir, ".git"))) return;
  try {
    execFileSync("git", ["-C", ordersDir, "add", "--", ...paths], { stdio: "pipe" });
    execFileSync("git", ["-C", ordersDir, "commit", "--only", "-m", `sipariş: ${paths.length} yeni fiş (hafta ${week})`, "--", ...paths], { stdio: "pipe" });
    log(`  klasör git'ine commit'lendi (${paths.length} fiş).`);
  } catch (error) {
    log(`  UYARI: fişler yazıldı ama klasör commit'i başarısız: ${error instanceof Error ? error.message.split("\n")[0] : "bilinmeyen hata"}`);
  }
}

export async function runOrderWrite(options: OrderRunOptions): Promise<OrderRunResult> {
  const log = options.log ?? (() => undefined);
  const account = studioAccountOf(options.workspaceSlug);
  const plan = await options.repo.getWeeklyPlan(options.workspaceId, options.week);
  const result: OrderRunResult = { written: [], skipped: [], planFound: plan !== null };
  if (plan === null) return result;

  const groups = await ownDurationGroups(options.repo, options.workspaceId);
  const cache = new Map<string, EvidenceVideo | null>();
  const dir = join(options.ordersDir, account.studioSlug, plan.weekStart);
  const wantedSlot = options.slot?.toLowerCase();

  for (const item of plan.items) {
    if (item.position === undefined) continue; // sırasız = aday, sipariş olmaz
    const slot = item.briefSlot ?? `P${item.position}`;
    if (wantedSlot !== undefined && slot.toLowerCase() !== wantedSlot) continue;
    if (options.ideaId !== undefined && item.ideaId !== options.ideaId) continue;
    const evidence = await loadEvidence(options.repo, options.workspaceId, item.idea.evidence.map((e) => e.contentItemId), cache);
    const built = buildTicket({
      panelSlug: options.workspaceSlug as string,
      planWeek: plan.weekStart,
      idea: item.idea,
      position: item.position,
      ...(item.slotAt ? { slotAt: item.slotAt } : {}),
      ...(item.briefSlot ? { briefSlot: item.briefSlot } : {}),
      ...(plan.brief ? { brief: plan.brief } : {}),
      evidence,
      ownDurationGroups: groups,
    });
    if (!built.ok) {
      result.skipped.push({ slot, reason: built.reason });
      log(`  ${slot}: atlandı — ${built.reason}`);
      continue;
    }
    const path = join(dir, `${built.ticket.siparis_id}.md`);
    if (existsSync(path)) {
      result.skipped.push({ orderId: built.ticket.siparis_id, slot, reason: "exists" });
      log(`  ${slot}: atlandı — fiş zaten var (${path}); üstüne yazılmaz.`);
      continue;
    }
    if (options.dryRun) {
      log(`  ${slot}: yazılacaktı → ${path}`);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    try {
      writeFileSync(path, writeTicket(built.ticket, built.note), { encoding: "utf8", flag: "wx" }); // wx: yarışta bile üstüne yazmaz
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        result.skipped.push({ orderId: built.ticket.siparis_id, slot, reason: "exists" });
        continue;
      }
      throw error;
    }
    result.written.push({ orderId: built.ticket.siparis_id, path });
    log(`  ${slot}: yazıldı → ${path}`);
  }
  if (options.commit && !options.dryRun) commitTickets(options.ordersDir, result.written.map((w) => w.path), plan.weekStart, log);
  return result;
}
