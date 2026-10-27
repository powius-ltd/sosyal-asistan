/**
 * Örnek verinin TEK PLATFORMLU çeşidi (`MockRepositoryOptions.platform`; ortamda `MOCK_PLATFORM=tiktok`): ekranların Instagram dışı bir
 * hesapta nasıl göründüğünü görmek için. Varsayılan örnek veri (verilmezse) DEĞİŞMEZ.
 *
 * Kural: bir hesap tek platforma aittir ve rakipleri aynı platformdan olur. Çeşit hesap düzeyinde uygulanır (içerik o platformun
 * adresi / izlenme türüyle doğar): tek kendi hesap (herkese açık veriyle izlenen, resmi API bağlı değil), tüm rakipler ve içerik planları
 * o platformda. Platform adıyla dallanılmaz: izlenme türü `VIEWS_KIND_OF` tablosundan gelir.
 */
import type { AccountsResult } from "@/lib/data/mock/generators/accounts";
import type { Idea } from "@/lib/domain/intel";
import type { Platform, ViewsKind } from "@/lib/platforms/types";

/** Platformun herkese açık veriyle gelen izlenme türü. */
const VIEWS_KIND_OF: Record<Platform, ViewsKind> = { instagram: "ig_play_count", tiktok: "tt_play_count", youtube: "yt_views" };

/** Hesapları ve içerik planlarını tek platforma çevirir (yerinde değil: yeni nesne). İlk kendi hesap kalır, diğerleri ve planları çıkar. */
export function toSinglePlatform(accounts: AccountsResult, platform: Platform): AccountsResult {
  const [first] = accounts.ownAccounts;
  if (first === undefined) return accounts;
  const own = { ...first, platform, connection: "scrape_only" as const, scopes: [], tokenExpiresAt: undefined };
  const dropped = new Set(accounts.ownAccounts.slice(1).map((account) => account.id));
  return {
    workspace: accounts.workspace,
    ownAccounts: [own],
    competitors: accounts.competitors.map((competitor) => ({ ...competitor, platform })),
    plans: accounts.plans
      .filter((plan) => !(plan.ownerKind === "own" && dropped.has(plan.id)))
      .map((plan) => ({ ...plan, platform, source: "scrape" as const, viewsKind: VIEWS_KIND_OF[platform], legacy: undefined })),
  };
}

/** Fikirleri çeşidin platformuna taşır (üreteç sabit platformla yazar). */
export function ideasOnPlatform(ideas: Idea[], platform: Platform): Idea[] {
  for (const idea of ideas) idea.platform = platform;
  return ideas;
}
