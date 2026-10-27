/**
 * Genel bakış (`getOverview`): KPI'lar + günlük trendler + son tutanlar + maliyet. Hesap mock ile AYNI fonksiyondur
 * (`buildOverview` → `views/gains`, `views/best-times`, `lib/metrics`); burada yalnız girdi kümesi okunur (`own-scope`):
 *  - kapsamdaki kendi hesapların TÜM içerikleri + snapshot serileri + hesap snapshot'ları (izlenme kazancı/takipçi farkı),
 *  - tutanlar: izlenen rakiplerin kademe ≥ 3 içerikleri, son iki dönem (önceki dönem karşılaştırması için).
 * Maliyet `getCostSummary` ile AYNI kaynaktan yazılır (ekranlar arasında çelişmez). Saat: `ctx.now()`.
 */
import type { Competitor } from "@/lib/domain/competitor";
import type { Overview } from "@/lib/domain/overview";
import type { OverviewQuery } from "@/lib/data/queries";
import { createClock } from "@/lib/data/mock/mock-clock";
import { buildOverview } from "@/lib/data/mock/views/overview";
import { RepositoryError } from "@/lib/data/repository";
import { DAY_MS } from "@/lib/time";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { getCostSummary } from "@/lib/data/supabase/cost";
import { fetchCompetitorRows } from "@/lib/data/supabase/competitor-rows";
import { toCompetitor } from "@/lib/data/supabase/mappers/accounts";
import { loadOutlierItems, loadOwnScope } from "@/lib/data/supabase/own-scope";
import { listOwnAccounts, requireWorkspace } from "@/lib/data/supabase/workspace";

export async function getOverview(ctx: SupabaseContext, wsId: string, query: OverviewQuery = {}): Promise<Overview> {
  const workspace = await requireWorkspace(ctx, wsId);
  const now = ctx.now();
  const days = Math.min(Math.max(Math.floor(query.days ?? 30), 1), 365);

  const [own, competitorRows] = await Promise.all([listOwnAccounts(ctx, wsId), fetchCompetitorRows(ctx, wsId)]);
  const competitors: Competitor[] = competitorRows.map((row) => toCompetitor(row, 0));
  const account = query.accountId === undefined ? undefined : own.find((a) => a.id === query.accountId);
  if (query.accountId !== undefined && !account) throw new RepositoryError("not_found", `Hesap bulunamadı: ${query.accountId}`);

  // Kapsam: hesap + platform süzgeci (`buildOverview` aynı süzgeci yeniden uygular; burada yalnız okuma daraltılır).
  const scopeIds = own.filter((a) => (!account || a.id === account.id) && (!query.platform || a.platform === query.platform)).map((a) => a.id);
  const platforms = [...new Set([query.platform, account?.platform].filter((p): p is NonNullable<typeof p> => p !== undefined))];
  const since = new Date(now.getTime() - (2 * days + 2) * DAY_MS).toISOString();

  const [scope, outliers] = await Promise.all([loadOwnScope(ctx, wsId, scopeIds), loadOutlierItems(ctx, wsId, { since, platforms })]);
  const overview = buildOverview(
    {
      ws: workspace,
      own,
      competitors,
      items: [...scope.items, ...outliers],
      snapshotsByItem: scope.snapshotsByItem,
      accountSnapshots: scope.accountSnapshots,
      runs: [],
      clock: createClock(now.toISOString()),
    },
    query,
  );
  return { ...overview, cost: await getCostSummary(ctx, workspace) };
}
