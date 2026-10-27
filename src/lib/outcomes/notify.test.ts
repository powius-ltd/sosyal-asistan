import { describe, expect, it, vi } from "vitest";

import type { MeasurementDue } from "@/lib/domain/outcomes";
import { ideaLinkSuggestedDraft, insertNotification, measurementDueDraft } from "@/lib/outcomes/notify";
import type { AdminClient } from "@/lib/supabase/admin";

const due = (day: 1 | 3 | 7, id = "c1"): MeasurementDue => ({
  contentItemId: id, ownerHandle: "ornek", shortcode: "AbC", publishedAt: "2026-10-06T16:00:00Z", day,
  windowStart: "2026-10-07T16:00:00Z", windowEnd: "2026-10-08T16:00:00Z",
});

/** `notifications` tablosu benzetimi: aynı (workspace, dedupe_key) ikinci kez yazılırsa 23505 (kısmi benzersiz indeks gibi). */
function fakeDb() {
  const seen = new Set<string>();
  const insert = vi.fn(async (row: { workspace_id: string; dedupe_key: string }) => {
    const key = `${row.workspace_id}|${row.dedupe_key}`;
    if (seen.has(key)) return { error: { code: "23505", message: "duplicate key" } };
    seen.add(key);
    return { error: null };
  });
  return { db: { from: () => ({ insert }) } as unknown as AdminClient, insert };
}

describe("döngü bildirimleri yinelenmez", () => {
  it("aynı (Reels, gün) ikinci kez yazılmaz; farklı gün/Reels yeni bildirimdir", async () => {
    const { db } = fakeDb();
    const write = (item: MeasurementDue) => insertNotification(db, "ws", measurementDueDraft(item));
    expect(await write(due(3))).toBe(true);
    expect(await write(due(3))).toBe(false);
    expect(await write(due(7))).toBe(true);
    expect(await write(due(3, "c2"))).toBe(true);
  });

  it("anahtar ve metinler: ölçüm bildirimi (içerik, gün); öneri bildirimi (fikir, kısa kod)", () => {
    const draft = measurementDueDraft(due(7));
    expect(draft).toMatchObject({ kind: "measurement_due", dedupeKey: "measurement_due:c1:d7", contentItemId: "c1" });
    expect(draft.title).toContain("7. gün");
    expect(draft.body, "bildirim müşteriye de görünür: komut yok").not.toMatch(/npm run|--/);
    const suggested = ideaLinkSuggestedDraft({ ideaId: "i1", ideaTitle: "Fiyat hatası", shortcode: "AbC", contentItemId: "c1", reasons: ["Metin benzerliği %80"] });
    expect(suggested).toMatchObject({ kind: "idea_link_suggested", dedupeKey: "idea_link_suggested:i1:AbC" });
    expect(suggested.body).toContain("Fiyat hatası");
  });

  it("23505 dışındaki hata sessizce yutulmaz", async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: "42501", message: "izin yok" } }) }) } as unknown as AdminClient;
    await expect(insertNotification(db, "ws", measurementDueDraft(due(1)))).rejects.toThrow(/Bildirim yazılamadı/);
  });
});
