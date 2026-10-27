/**
 * Mock depo: kredi defteri (`getCreditBalance`, `listCreditEntries`, `reserveCredits`, `releaseCredits`). Kurallar Supabase ile AYNI:
 * bellekteki defter (`lib/credits/memory-ledger.ts`) aynı girdi şemasını ve aynı saf hesabı kullanır. Mock'ta tek kullanıcı, tek hesap vardır.
 * Tohum: bir aylık kredi + bir ek satın alma + birkaç kesinleşmiş iş (ekranlar boş defter görmesin). Kredi verme ve kesinleştirme sunucu /
 * işçi işidir: depo arayüzünde yoktur, yalnız sözleşme testleri için `grant` / `settle` kancaları açılır.
 */
import { createMemoryCreditLedger } from "@/lib/credits/memory-ledger";
import { parseCreditEntryFilter, parseCreditKey, parseReserveCreditsInput } from "@/lib/data/credit-input";
import { clampLimit } from "@/lib/data/mock/mock-filters";
import type { MockContext } from "@/lib/data/mock/repos/context";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import { isUuid } from "@/lib/data/supabase/errors";
import { CREDIT_PRICE_VERSION, creditsFor } from "@/lib/domain/credit-pricing";
import type { CreditEntry, CreditHold } from "@/lib/domain/credits";

export type CreditMethods = Pick<PanelRepository, "getCreditBalance" | "listCreditEntries" | "reserveCredits" | "releaseCredits">;

export interface MockCredits {
  methods: CreditMethods;
  /** SUNUCU ROLÜ (test): kredi verir. */
  grant(input: unknown): CreditEntry;
  /** İŞÇİ ROLÜ (test): ayırmayı kesinleştirir. */
  settle(input: unknown): CreditHold;
  /** İş deposu (zorlama açıkken): iş açılırken ayırır, iş başlamadan kapanınca bırakır (Supabase'de iş RPC'lerinin içinde). */
  reserve(input: unknown, workspaceId: string): CreditHold;
  release(key: string): CreditHold;
}

export function createCredits(ctx: MockContext): MockCredits {
  const { clock, ws, inWs, requireWs } = ctx;
  let stamp = (): string => clock.tick();
  const ledger = createMemoryCreditLedger({ now: () => new Date(clock.nowMs), stamp: () => stamp() });

  // ---- Tohum (geçmiş tarihli): aylık 1.000 + ek 500; bir inceleme (7 video), bir haftalık plan, bir not.
  const seed = (daysAgo: number, run: () => void) => {
    stamp = () => clock.daysAgo(daysAgo);
    run();
    stamp = () => clock.tick();
  };
  const charge = (key: string, daysAgo: number, reserved: number, actual: number, units: Record<string, number>) =>
    seed(daysAgo, () => {
      ledger.reserve({ amount: reserved, key }, ws.id);
      ledger.settle({ key, actual, units, priceVersion: CREDIT_PRICE_VERSION });
    });
  seed(20, () => ledger.grant({ type: "grant_monthly", amount: 1000, key: "seed-monthly", expiresAt: clock.daysAhead(10), note: "Aylık kredi" }));
  seed(12, () => ledger.grant({ type: "purchase", amount: 500, key: "seed-purchase", note: "Ek kredi" }));
  charge("seed-analyze", 6, creditsFor("video_review", 19) ?? 0, creditsFor("video_review", 7) ?? 0, { video_review: 7 });
  charge("seed-plan", 5, creditsFor("weekly_plan", 1) ?? 0, creditsFor("weekly_plan", 1) ?? 0, { weekly_plan: 1 });
  charge("seed-briefing", 4, creditsFor("briefing", 1) ?? 0, creditsFor("briefing", 1) ?? 0, { briefing: 1 });

  const methods: CreditMethods = {
    async getCreditBalance(wsId) {
      requireWs(wsId);
      return ledger.balance();
    },

    async listCreditEntries(wsId, filter) {
      const parsed = parseCreditEntryFilter(filter);
      if (!inWs(wsId)) return [];
      return ledger
        .entries()
        .filter((entry) => (parsed.types === undefined || parsed.types.includes(entry.type)) && (!parsed.onlyWorkspace || entry.workspaceId === wsId))
        .slice(0, clampLimit(parsed.limit));
    },

    // Sıra Supabase ile aynı: önce girdi, sonra çalışma alanı.
    async reserveCredits(wsId, input) {
      const request = parseReserveCreditsInput(input);
      requireWs(wsId);
      // Bağlı iş Supabase ile aynı doğrulanır: biçimsiz kimlik `invalid_input`, olmayan iş `not_found` (orada UUID denetimi + FK).
      if (request.panelJobId !== undefined && !ctx.state.jobs.some((job) => job.id === request.panelJobId)) {
        if (isUuid(request.panelJobId)) throw new RepositoryError("not_found", "Bağlı kayıt bulunamadı.");
        throw new RepositoryError("invalid_input", "İş kimliği geçersiz.");
      }
      return ledger.reserve(request, wsId);
    },

    async releaseCredits(wsId, key) {
      const parsed = parseCreditKey(key);
      requireWs(wsId);
      return ledger.release(parsed);
    },
  };

  return {
    methods,
    grant: (input) => ledger.grant(input),
    settle: (input) => ledger.settle(input),
    reserve: (input, workspaceId) => ledger.reserve(input, workspaceId),
    release: (key) => ledger.release(key),
  };
}
