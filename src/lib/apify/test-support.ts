/**
 * Test yardımcıları (yalnız `*.test.ts` içe aktarır; üretim koduna girmez): bellekte `collection_runs` tablosu +
 * `reserve_budget` RPC benzetimi olan sahte Supabase istemcisi, ve Apify `fetch` yanıtı kurucuları.
 * Benzetim, SQL'in ay toplamı kuralını (Σ greatest(actual, reserved), tavan aşımı → `budget_exceeded`) birebir uygular.
 */
import type { CollectionRunRow } from "@/lib/apify/budget";
import type { AdminClient } from "@/lib/supabase/admin";

export const TEST_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

let sequence = 0;

export function makeRunRow(overrides: Partial<CollectionRunRow> = {}): CollectionRunRow {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    workspace_id: TEST_WORKSPACE_ID,
    provider: "apify",
    kind: "content",
    status: "reserved",
    billing: "metered",
    purpose: null,
    model: null,
    panel_job_id: null,
    target_label: null,
    external_run_id: null,
    dataset_id: null,
    reserved_usd: 0,
    actual_usd: null,
    usage_settled_at: null,
    price_unknown: false,
    expected_results: null,
    item_count: null,
    not_item_reasons: null,
    error: null,
    input_tokens: null,
    output_tokens: null,
    started_at: "2026-09-30T08:00:00.000Z",
    finished_at: null,
    updated_at: "2026-09-30T08:00:00.000Z",
    ...overrides,
  };
}

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };

class FakeQuery implements PromiseLike<Result> {
  private mode: "select" | "update" = "select";
  private patch: Row = {};
  private returning = false;
  private readonly filters: ((row: Row) => boolean)[] = [];
  private sortBy?: { column: string; ascending: boolean };
  private max?: number;

  constructor(
    private readonly rows: Row[],
    private readonly log: FakeRunsDb["updates"],
    private readonly shouldFailUpdate: () => boolean,
  ) {}

  select(): this {
    if (this.mode === "update") this.returning = true;
    return this;
  }
  update(patch: Row): this {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  is(column: string, value: null): this {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  not(column: string, _operator: "is", value: null): this {
    this.filters.push((row) => (row[column] ?? null) !== value);
    return this;
  }
  gte(column: string, value: string): this {
    this.filters.push((row) => String(row[column]) >= value);
    return this;
  }
  order(column: string, options?: { ascending?: boolean }): this {
    this.sortBy = { column, ascending: options?.ascending ?? true };
    return this;
  }
  limit(count: number): this {
    this.max = count;
    return this;
  }

  /** Filtreleri uygular; güncelleme kipinde yamayı uygular. `null` = simüle edilmiş DB hatası. */
  private run(): Row[] | null {
    if (this.mode === "update" && this.shouldFailUpdate()) return null;
    let matched = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.sortBy) {
      const { column, ascending } = this.sortBy;
      matched = [...matched].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
    }
    if (this.max !== undefined) matched = matched.slice(0, this.max);
    if (this.mode === "update") {
      for (const row of matched) {
        Object.assign(row, this.patch);
        this.log.push({ id: String(row.id), patch: { ...this.patch } });
      }
    }
    return matched;
  }

  maybeSingle(): Promise<Result> {
    const matched = this.run();
    if (!matched) return Promise.resolve(DB_DOWN);
    // Gerçek DB gibi ANLIK GÖRÜNTÜ döner (canlı satır nesnesi değil): okuma sonrası yarışlar testte de sahici olur.
    return Promise.resolve({ data: matched[0] ? { ...matched[0] } : null, error: null });
  }

  then<T1 = Result, T2 = never>(
    onFulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): Promise<T1 | T2> {
    const matched = this.run();
    const result: Result = !matched
      ? DB_DOWN
      : { data: this.mode === "update" && !this.returning ? null : matched, error: null };
    return Promise.resolve(result).then(onFulfilled, onRejected);
  }
}

const DB_DOWN: Result = { data: null, error: { message: "veritabanına ulaşılamadı" } };

export interface FakeRunsDb {
  client: AdminClient;
  rows: CollectionRunRow[];
  /** Yapılan `rpc` çağrıları (ad + argüman). */
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  /** Uygulanan güncellemeler (satır kimliği + yama). */
  updates: { id: string; patch: Row }[];
}

export interface FakeRunsDbOptions {
  /** Aylık Apify tavanı (USD); varsayılan 10. */
  capUsd?: number;
  rows?: Partial<CollectionRunRow>[];
  /** Verilirse `reserve_budget` bu hatayla düşer (ör. `workspace_not_found`). */
  rpcError?: { message: string; details?: string };
  /** İlk N güncelleme "veritabanına ulaşılamadı" hatasıyla düşer (sonrakiler çalışır). */
  failFirstUpdates?: number;
}

const formatNumeric = (value: number) => value.toFixed(6);

export function createFakeRunsDb(options: FakeRunsDbOptions = {}): FakeRunsDb {
  const capUsd = options.capUsd ?? 10;
  const rows = (options.rows ?? []).map((row) => makeRunRow(row));
  const rpcCalls: FakeRunsDb["rpcCalls"] = [];
  const updates: FakeRunsDb["updates"] = [];
  let updatesToFail = options.failFirstUpdates ?? 0;
  const shouldFailUpdate = () => updatesToFail-- > 0;

  const committed = () =>
    rows
      .filter((row) => row.provider === "apify")
      .reduce((sum, row) => sum + Math.max(row.actual_usd ?? 0, row.reserved_usd), 0);

  const client = {
    from(table: string) {
      if (table !== "collection_runs") throw new Error(`Sahte istemci yalnız collection_runs bilir: ${table}`);
      return new FakeQuery(rows as unknown as Row[], updates, shouldFailUpdate);
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn !== "reserve_budget") throw new Error(`Sahte istemci bu RPC'yi bilmez: ${fn}`);
      if (options.rpcError) return Promise.resolve({ data: null, error: options.rpcError });

      const amount = Number(args.p_amount);
      const spent = committed();
      if (amount > 0 && spent + amount > capUsd) {
        return Promise.resolve({
          data: null,
          error: {
            message: "budget_exceeded",
            details: `cap=${formatNumeric(capUsd)} committed=${formatNumeric(spent)} requested=${formatNumeric(amount)}`,
            hint: "Aylık tavanı Ayarlar ekranından artır ya da ay başını bekle.",
          },
        });
      }
      const draft = args.p_run as Record<string, unknown>;
      const row = makeRunRow({
        workspace_id: String(args.p_ws),
        provider: String(args.p_provider),
        kind: String(draft.kind),
        billing: (draft.billing as string | undefined) ?? "metered",
        target_label: (draft.target_label as string | undefined) ?? null,
        expected_results: (draft.expected_results as number | undefined) ?? null,
        price_unknown: Boolean(draft.price_unknown),
        reserved_usd: amount,
      });
      rows.push(row);
      return Promise.resolve({ data: row, error: null });
    },
  };

  return { client: client as unknown as AdminClient, rows, rpcCalls, updates };
}

/** `fetch` yanıtı: JSON gövdeli `Response`. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Apify `POST /runs` / `GET /actor-runs/{id}` yanıt gövdesi. */
export function runEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: "apifyRun1",
      status: "RUNNING",
      defaultDatasetId: "dataset1",
      ...overrides,
    },
  };
}
