import { describe, expect, it } from "vitest";

import { PUBLISH_LIMIT_24H } from "@/components/publish/publish-limits";
import { computePublishQuota } from "@/components/publish/quota";
import type { OwnAccount } from "@/lib/domain/competitor";

function account(id: string, connection: OwnAccount["connection"]): OwnAccount {
  return {
    id,
    workspaceId: "ws",
    platform: "instagram",
    handle: `h_${id}`,
    connection,
    scopes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("computePublishQuota", () => {
  it("yalnız bağlı hesaplar için satır üretir; bağlı hesap yoksa boş liste (bağlantı yok)", () => {
    const summary = { publishedLast24hByAccount: {} };
    expect(computePublishQuota([account("a", "scrape_only"), account("b", "expired")], summary)).toEqual([]);
    expect(computePublishQuota([account("a", "connected")], summary)).toEqual([
      { accountId: "a", handle: "h_a", used: 0, limit: PUBLISH_LIMIT_24H },
    ]);
  });

  it("kullanılan sayıyı özetten alır; özette olmayan hesap 0, bağlı olmayan hesabın sayısı yok sayılır", () => {
    const rows = computePublishQuota(
      [account("a", "connected"), account("b", "connected"), account("c", "scrape_only")],
      { publishedLast24hByAccount: { a: 2, c: 7 } },
    );
    expect(rows.map((r) => [r.accountId, r.used])).toEqual([
      ["a", 2],
      ["b", 0],
    ]);
  });
});
