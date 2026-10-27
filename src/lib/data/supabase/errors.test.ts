import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { RepositoryError } from "@/lib/data/repository";
import { isUuid, onlyUuids, toRepositoryError, unwrap } from "@/lib/data/supabase/errors";
import { chunk, clampLimit, fetchAllRows, inChunks, pageOf, POSTGREST_MAX_ROWS } from "@/lib/data/supabase/paging";

const error = (code: string, message = "ham ileti") =>
  ({ name: "PostgrestError", code, message, details: "gizli ayrıntı", hint: "" }) as unknown as PostgrestError;

describe("PostgREST hata çevirisi", () => {
  const codeOf = (e: PostgrestError) => (toRepositoryError(e) as RepositoryError).code;

  it("bilinen kodlar depo hata koduna çevrilir", () => {
    expect(codeOf(error("23505"))).toBe("already_exists");
    expect(codeOf(error("23503"))).toBe("not_found");
    expect(codeOf(error("22P02"))).toBe("invalid_input");
    expect(codeOf(error("P0002"))).toBe("not_found");
    expect(codeOf(error("P0001", "budget_exceeded"))).toBe("budget_exceeded");
    expect(codeOf(error("23514", "publish_invalid_transition"))).toBe("invalid_state");
    expect(codeOf(error("23514", 'new row violates check constraint "publish_jobs_human_approval"'))).toBe("invalid_state");
    expect(codeOf(error("23514", "publish_approver_not_editor"))).toBe("invalid_state");
    expect(codeOf(error("23514", "collections_name_check"))).toBe("invalid_input");
  });

  it("kredi defteri (0017): yetersiz → insufficient_credits (istenen + harcanabilir), koruma → invalid_state, girdi → invalid_input, ayırma yok → not_found", () => {
    const short = toRepositoryError({ ...error("P0001", "insufficient_credits"), details: "available=30 requested=31" } as PostgrestError);
    expect(short).toMatchObject({ name: "RepositoryError", code: "insufficient_credits", available: 30, requested: 31 });
    expect(toRepositoryError(error("P0001", "insufficient_credits")), "ayrıntı okunamazsa sayı uydurulmaz").toMatchObject({ code: "insufficient_credits", available: undefined });
    expect(codeOf(error("23505", "credit_hold_active"))).toBe("already_exists");
    for (const message of ["credit_ledger_immutable", "credit_negative_balance", "credit_hold_released", "credit_hold_closed", "credit_lot_expired"]) {
      expect(codeOf(error("23514", message)), message).toBe("invalid_state");
    }
    expect(codeOf(error("23514", 'new row for relation "credit_ledger" violates check constraint "credit_ledger_shape"'))).toBe("invalid_input");
    for (const message of ["credit_idempotency_conflict", "credit_settle_exceeds_hold", "credit_invalid_amount"]) expect(codeOf(error("22023", message)), message).toBe("invalid_input");
    expect(codeOf(error("P0002", "credit_hold_not_found"))).toBe("not_found");
    expect(toRepositoryError(error("22023", "invalid_billing")), "kredi dışı 22023 depo hatası değildir").not.toBeInstanceOf(RepositoryError);
  });

  it("panel işi (0016): etkin iş → already_exists, koruma/iptal → invalid_state, iş yok → not_found, kısıt → invalid_input", () => {
    expect(codeOf(error("23505", "panel_job_active"))).toBe("already_exists");
    expect(toRepositoryError(error("23505", 'duplicate key value violates unique constraint "panel_jobs_one_active_per_workspace"')).message).toMatch(/sırada ya da çalışan/);
    for (const message of ["panel_job_finished", "panel_job_invalid_transition", "panel_job_approval_immutable", "panel_job_approver_not_editor"]) {
      expect(codeOf(error("23514", message)), message).toBe("invalid_state");
    }
    expect(toRepositoryError(error("23514", "panel_job_approver_not_editor")).message).toMatch(/editör\/sahip/);
    expect(codeOf(error("P0002", "panel_job_not_found"))).toBe("not_found");
    expect(toRepositoryError(error("P0002", "panel_job_not_found")).message).toBe("İş bulunamadı.");
    // Onaysız harcama / onay kaydı CHECK'leri girdi hatasıdır (`panel_jobs_*`, alt çizgiden önce çoğul).
    expect(codeOf(error("23514", 'new row for relation "panel_jobs" violates check constraint "panel_jobs_spend_needs_approval"'))).toBe("invalid_input");
  });

  it("onaylayan üye değilse Türkçe açıklayıcı mesaj verir; ham ileti/ayrıntı sızmaz", () => {
    expect(toRepositoryError(error("23514", "publish_approver_not_editor")).message).toMatch(/editör\/sahip/);
    for (const e of [error("23505"), error("23514", "publish_x")]) {
      const text = toRepositoryError(e).message;
      expect(text).not.toContain("gizli ayrıntı");
    }
  });

  it("bilinmeyen kod genel Error olur (RepositoryError değil)", () => {
    const unknown = toRepositoryError(error("XX000", "bir şey bozuldu"));
    expect(unknown).not.toBeInstanceOf(RepositoryError);
    expect(unknown.message).toContain("XX000");
    expect(toRepositoryError(error("P0001", "başka_kural"))).not.toBeInstanceOf(RepositoryError);
  });

  it("unwrap: veriyi döndürür, hatada fırlatır (maybeSingle boşu null kalır)", () => {
    expect(unwrap({ data: [1, 2], error: null })).toEqual([1, 2]);
    expect(unwrap({ data: null as string | null, error: null })).toBeNull();
    expect(() => unwrap({ data: null, error: error("23505") })).toThrowError(expect.objectContaining({ code: "already_exists" }));
  });
});

describe("UUID denetimi", () => {
  it("yalnız UUID biçimi geçer; onlyUuids sırayı korur", () => {
    expect(isUuid("7a3f0000-0000-4000-8000-000000000001")).toBe(true);
    for (const bad of ["abc", "ws_mock_1", "", 5, null, undefined, "7a3f0000-0000-4000-8000-00000000000g"]) expect(isUuid(bad), String(bad)).toBe(false);
    expect(onlyUuids(["x", "00000000-0000-4000-8000-00000000abcd", "y"])).toEqual(["00000000-0000-4000-8000-00000000abcd"]);
  });
});

describe("sayfalama yardımcıları", () => {
  it("clampLimit: varsayılan 50, en az 1, en çok 200", () => {
    expect([clampLimit(undefined), clampLimit(0), clampLimit(-5), clampLimit(7.9), clampLimit(10_000), clampLimit(Number.NaN)]).toEqual([50, 1, 1, 7, 200, 50]);
  });

  it("pageOf: ilk `limit` satır; nextCursor yalnız verilirse; total isteğe bağlı", () => {
    expect(pageOf([1, 2, 3], 2, "c", 9)).toEqual({ items: [1, 2], total: 9, nextCursor: "c" });
    expect(pageOf([1], 2, undefined)).toEqual({ items: [1] });
  });

  it("chunk / inChunks: parçalara böler, paralel okur, boş listede istek atmaz", async () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    let calls = 0;
    const out = await inChunks([1, 2, 3, 4, 5], async (part) => (calls++, part.map((n) => n * 2)), 2);
    expect([out, calls]).toEqual([[2, 4, 6, 8, 10], 3]);
    expect(await inChunks([], async () => (calls++, [1]))).toEqual([]);
    expect(calls).toBe(3);
  });

  it("fetchAllRows: tam sayfa geldikçe devam eder, kısa sayfada durur; hatada fırlatır", async () => {
    const pages: number[][] = [Array(POSTGREST_MAX_ROWS).fill(1), Array(POSTGREST_MAX_ROWS).fill(2), [3, 3, 3]];
    const seen: [number, number][] = [];
    const all = await fetchAllRows(async (from, to) => (seen.push([from, to]), { data: pages[seen.length - 1], error: null }));
    expect(all).toHaveLength(2 * POSTGREST_MAX_ROWS + 3);
    expect(seen).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    await expect(fetchAllRows(async () => ({ data: null, error: error("23503") }))).rejects.toMatchObject({ code: "not_found" });
  });
});
