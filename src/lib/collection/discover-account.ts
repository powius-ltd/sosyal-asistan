/**
 * Hesap doğrulama (başlangıç akışının `verify` adımı): çalışma alanının KENDİ hesabının herkese açık profiline tek, bütçeli bakış. İçerik
 * toplamadan ÖNCE koşar: gizli ya da bulunamayan hesapta içerik koşusuna para harcanmaz ve "bu sen misin?" ekranı profil özetini alır.
 *
 * DB'ye profil YAZMAZ (profil ölçümünü ve sahip satırını toplamanın profil aşaması yazar); yalnız koşu satırı açılır / kapanır. Platforma
 * dallanmaz: iş tanımı ve ayrıştırma `PlatformModule`'dendir; modülü olmayan platformda `unsupported` döner (koşu yok).
 */
import "server-only";

import { createPaidRun, closePaidRun, runWithinBudget } from "@/lib/collection/discover-paid";
import { createDiscoverStore, type DiscoverStore } from "@/lib/collection/discover-store";
import { resolveProfileAccess } from "@/lib/collection/profile-rows";
import { finishIngested, noteRunError } from "@/lib/collection/run-scrape";
import type { CollectDeps } from "@/lib/collection/types";
import { getPlatformModule, hasPlatformModule } from "@/lib/platforms/registry";
import type { NormalizedProfile } from "@/lib/platforms/types";
import type { AdminClient } from "@/lib/supabase/admin";

export interface VerifyAccountOptions {
  client: AdminClient;
  workspaceId: string;
  /** Bu bakışın harcama tavanı (USD): tahmin aşıyorsa koşu başlatılmaz. */
  maxUsd: number;
  now: Date;
  /** Mutabakat beklemesi (ms; varsayılan 0: çağıran iş sonunda toplu mutabakat yapar). */
  reconcileWaitMs?: number;
  log?: (line: string) => void;
}

export type AccountVerification = {
  /**
   * ok: profil açık okundu · private / not_found: hesap gizli / yok · no_account: çalışma alanında kendi hesap yok · unsupported: platform
   * modülü yok · blocked: tahmin tavanı aşıyor (koşu yok) · error: koşu ya da ayrıştırma hatası.
   */
  outcome: "ok" | "private" | "not_found" | "no_account" | "unsupported" | "blocked" | "error";
  /** Okunan profil (`ok`; gizli hesap profil satırıyla geldiyse `private`'ta da dolu). */
  profile?: NormalizedProfile;
  reason?: string;
  /** Bu bakışta rezerve edilen tutar (USD); koşu açılmadıysa 0. */
  reservedUsd: number;
  actualUsd?: number;
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : "bilinmeyen hata");

export async function verifyOwnAccount(options: VerifyAccountOptions, depsIn: CollectDeps & { store?: DiscoverStore } = {}): Promise<AccountVerification> {
  const { store: storeIn, ...collectDeps } = depsIn;
  const store = storeIn ?? createDiscoverStore(options.client);
  const [own] = await store.ownAccounts(options.workspaceId);
  if (own === undefined) return { outcome: "no_account", reason: "Çalışma alanında kendi hesap yok.", reservedUsd: 0 };
  if (!hasPlatformModule(own.platform)) return { outcome: "unsupported", reason: `Platform modülü yok: ${own.platform}.`, reservedUsd: 0 };

  const adapter = getPlatformModule(own.platform).publicData;
  const run = createPaidRun({ workspaceId: options.workspaceId, now: options.now, maxUsd: options.maxUsd, log: options.log }, { ...collectDeps, client: collectDeps.client ?? options.client });
  const result = await runWithinBudget(run, { label: `doğrulama @${own.handle}`, spec: adapter.buildProfileJob([own.handle]) });
  if (!result.ok) {
    const cost = await closePaidRun(run, options.reconcileWaitMs ?? 0);
    return { outcome: "skipped" in result ? "blocked" : "error", reason: result.reason, reservedUsd: cost.reservedUsd, ...(cost.actualUsd === undefined ? {} : { actualUsd: cost.actualUsd }) };
  }

  let verdict: Pick<AccountVerification, "outcome" | "profile" | "reason">;
  try {
    const parsed = adapter.parseProfiles(result.items);
    const { profile, access } = resolveProfileAccess(own.handle, parsed, 1);
    await finishIngested(run.ctx, result.runId, { itemCount: parsed.items.length, notItems: parsed.notItems });
    if (access.state === "ok" && profile !== undefined) verdict = { outcome: "ok", profile };
    else if (access.state === "private" || access.state === "not_found") verdict = { outcome: access.state, reason: access.reason, ...(profile === undefined ? {} : { profile }) };
    else verdict = { outcome: "error", reason: access.reason ?? "profil okunamadı" };
  } catch (error) {
    const reason = `Profil verisi işlenemedi: ${messageOf(error)}`;
    await noteRunError(run.ctx, result.runId, reason).catch(() => undefined);
    verdict = { outcome: "error", reason };
  }
  const cost = await closePaidRun(run, options.reconcileWaitMs ?? 0);
  return { ...verdict, reservedUsd: cost.reservedUsd, ...(cost.actualUsd === undefined ? {} : { actualUsd: cost.actualUsd }) };
}
