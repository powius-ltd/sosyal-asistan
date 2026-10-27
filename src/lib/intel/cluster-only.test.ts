import { describe, expect, it } from "vitest";

import type { IntelContext } from "@/lib/intel/context";
import { clusterOnly } from "@/lib/intel/plan-run";

/** Hesap türü konu × hook matrisini kullanmıyorsa kümeleme hiç başlamaz: DB/LLM'e dokunulmaz (bağlam alanları boş bırakılabilir). */
describe("clusterOnly", () => {
  it("business: atlanır (skipped_account_type), sebep notta; hiçbir okuma/yazma yapılmaz", async () => {
    const ctx = { workspace: { accountType: "business" } } as unknown as IntelContext;
    const result = await clusterOnly(ctx);
    expect(result).toMatchObject({ outcome: "skipped_account_type", clusters: 0, contents: 0 });
    expect(result.saved).toBeUndefined();
    expect(result.notes.join(" ")).toContain("konu × hook matrisini kullanmıyor");
  });
});
