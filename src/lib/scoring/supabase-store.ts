/**
 * `ScoringStore`'un Supabase (service role) uygulaması — ince DB katmanı; hesap yok, yalnız okuma/yazma.
 *
 * N+1 yok: içerikler anahtar kümesiyle (id) sayfalı, son metrikler kimlik listesiyle parça parça okunur;
 * skorlar parça başına TEK upsert (`on conflict (id) do update`) ile yazılır. RPC yoktur: upsert'in INSERT kolu
 * NOT NULL/XOR kısıtlarını geçsin diye kimlik sütunları okunduğu gibi geri gönderilir. Not: okuma ile yazma
 * arasında TEK BAŞINA silinen bir içerik upsert ile yeniden oluşur (sahip silindiyse FK hatası verir); F1'de içerik
 * tek başına silinmez (yalnız sahip/çalışma alanıyla cascade).
 */
import "server-only";

import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { chunk, mapConcurrent } from "@/lib/scoring/batch";
import type {
  ContentScoringRow,
  LatestMetricsRow,
  ScoreWriteRow,
  ScoringOwner,
  ScoringStore,
} from "@/lib/scoring/types";

export interface ScoringStoreLimits {
  /** Sayfalı okumada sayfa boyutu (PostgREST `max_rows` sınırını aşarsa yine doğru çalışır, yalnız istek artar). */
  pageSize: number;
  /** `content_latest_metrics` okumasında istek başına içerik kimliği (URL uzunluğu: 100 × 37 karakter ≈ 3,7 KB). */
  idsPerRead: number;
  /** Toplu yazımda istek başına satır (gövde: satır başına ≤ 25 baz çizgisi öğesi ≈ 3 KB). */
  rowsPerWrite: number;
  /** Aynı anda en çok kaç istek. */
  concurrency: number;
}

export const DEFAULT_SCORING_LIMITS: Readonly<ScoringStoreLimits> = {
  pageSize: 1000,
  idsPerRead: 100,
  rowsPerWrite: 200,
  concurrency: 4,
};

const CONTENT_SELECT =
  "id, workspace_id, platform, external_id, format, social_account_id, competitor_id, published_at, is_pinned";

type PageResult<Row> = PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;

/** Sahip türü → `content_items` / `account_snapshots` sahip sütunu. */
export function ownerColumn(owner: ScoringOwner): "social_account_id" | "competitor_id" {
  return owner.kind === "own" ? "social_account_id" : "competitor_id";
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`Skor: ${what} (${error.message}).`);
}

/**
 * Anahtar kümesiyle (id artan) tüm sayfaları okur; boş sayfa gelene kadar sürer (sunucu sayfayı `max_rows` ile
 * kırpsa bile satır kaçmaz).
 */
async function readAllPages<Row extends { id: string }>(
  what: string,
  page: (afterId: string | undefined) => PageResult<Row>,
): Promise<Row[]> {
  const rows: Row[] = [];
  let afterId: string | undefined;
  for (;;) {
    const { data, error } = await page(afterId);
    if (error) fail(`${what} okunamadı`, error);
    if (!data || data.length === 0) return rows;
    rows.push(...data);
    afterId = data[data.length - 1].id;
  }
}

export function createSupabaseScoringStore(
  client: AdminClient,
  limits: Readonly<ScoringStoreLimits> = DEFAULT_SCORING_LIMITS,
): ScoringStore {
  const { pageSize, idsPerRead, rowsPerWrite, concurrency } = limits;

  return {
    async listOwners(wsId) {
      const own = await readAllPages("kendi hesaplar", (afterId) => {
        let query = client.from("social_accounts").select("id").eq("workspace_id", wsId);
        if (afterId) query = query.gt("id", afterId);
        return query.order("id").limit(pageSize);
      });
      const competitors = await readAllPages("izlenen rakipler", (afterId) => {
        let query = client.from("competitors").select("id").eq("workspace_id", wsId).eq("status", "tracked");
        if (afterId) query = query.gt("id", afterId);
        return query.order("id").limit(pageSize);
      });
      return [
        ...own.map((row): ScoringOwner => ({ kind: "own", id: row.id })),
        ...competitors.map((row): ScoringOwner => ({ kind: "competitor", id: row.id })),
      ];
    },

    async listOwnerContent(wsId, owner) {
      const rows: ContentScoringRow[] = await readAllPages("içerikler", (afterId) => {
        let query = client
          .from("content_items")
          .select(CONTENT_SELECT)
          .eq("workspace_id", wsId)
          .eq(ownerColumn(owner), owner.id);
        if (afterId) query = query.gt("id", afterId);
        return query.order("id").limit(pageSize);
      });
      return rows;
    },

    async latestMetrics(wsId, contentIds) {
      const parts = chunk([...new Set(contentIds)], idsPerRead);
      const pages = await mapConcurrent(parts, concurrency, async (ids) => {
        const { data, error } = await client
          .from("content_latest_metrics")
          .select("content_item_id, views, views_kind")
          .eq("workspace_id", wsId)
          .in("content_item_id", ids);
        if (error) fail("son metrikler okunamadı", error);
        return data ?? [];
      });
      const byId = new Map<string, LatestMetricsRow>();
      for (const rows of pages) {
        for (const row of rows) if (row.content_item_id) byId.set(row.content_item_id, row);
      }
      return byId;
    },

    async latestFollowers(wsId, owner) {
      const { data, error } = await client
        .from("account_snapshots")
        .select("followers")
        .eq("workspace_id", wsId)
        .eq(ownerColumn(owner), owner.id)
        .not("followers", "is", null)
        .order("captured_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1);
      if (error) fail("takipçi sayısı okunamadı", error);
      const followers = data?.[0]?.followers;
      return typeof followers === "number" && Number.isFinite(followers) ? followers : undefined;
    },

    async writeScores(rows: readonly ScoreWriteRow[]) {
      await mapConcurrent(chunk(rows, rowsPerWrite), concurrency, async (part) => {
        const { error } = await client.from("content_items").upsert(part, { onConflict: "id" });
        if (error) fail("skorlar yazılamadı", error);
      });
    },
  };
}

/** Uygulamanın varsayılan deposu: süreç boyunca tek service role istemcisi. */
export function defaultScoringStore(): ScoringStore {
  return createSupabaseScoringStore(getAdminClient());
}
