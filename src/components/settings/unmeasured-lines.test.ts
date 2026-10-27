import { describe, expect, it } from "vitest";

import { MAX_SUMMARY_LINES, summarizeUnmeasured } from "@/components/settings/unmeasured-lines";
import type { UnmeasuredEntry } from "@/lib/domain/measured";

const entry = (over: Partial<UnmeasuredEntry>): UnmeasuredEntry => ({ scope: "content", subject: "@rakip · 10 içerik", reason: "r", source: "content_items.missing_fields", ...over });
const OWN = new Set(["benim"]);

describe("summarizeUnmeasured (D3-09)", () => {
  it("boş liste → satır yok", () => {
    expect(summarizeUnmeasured([], OWN)).toEqual([]);
  });

  it("yüzlerce tekrar eden satırı birkaç düz cümleye indirger; veritabanı ve sütun adları sızmaz", () => {
    const many: UnmeasuredEntry[] = [
      entry({ scope: "account", subject: "@benim · tiktok", field: undefined, source: "social_accounts.connection" }),
      ...["reach", "saves", "shares", "avgWatchSec"].flatMap((field) => ["a", "b", "c"].map((h) => entry({ subject: `@${h} · 30 içerik`, field }))),
      entry({ subject: "@benim · 30 içerik", field: "reach" }),
      entry({ subject: "@a · 4 içerik", field: "views" }),
      entry({ scope: "competitor", subject: "@gizli", field: undefined, source: "competitors.status" }),
      entry({ scope: "competitor", subject: "@yeni", field: "postsCount", source: "competitors.missing_fields" }),
    ];
    const lines = summarizeUnmeasured(many, OWN);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.length).toBeLessThanOrEqual(MAX_SUMMARY_LINES);
    const text = lines.join(" ");
    expect(text).not.toMatch(/_|avgWatchSec|postsCount|missing_fields|social_accounts|content_items/);
    expect(text).toContain("ortalama izlenme süresi");
  });

  it("kendi videosu ile rakip videosu ayrı cümlelerde; kendi hesap adı ownHandles'tan tanınır", () => {
    const lines = summarizeUnmeasured([entry({ subject: "@benim · 5 içerik", field: "reach" }), entry({ subject: "@rakip · 5 içerik", field: "saves" })], OWN);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Kendi videolarında erişim/);
    expect(lines[1]).toMatch(/^Rakiplerde kaydetme/);
  });
});
