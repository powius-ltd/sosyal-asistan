import { describe, expect, it } from "vitest";

import { makePlan } from "@/components/weekly-plan/test-fixtures";
import { EMPTY_WHERE_TEXT, NO_ASKS_TEXT } from "@/lib/overview/summary";
import { makeOverview } from "@/lib/overview/test-fixtures";
import { buildToday } from "@/lib/today/state";
import { makeBriefing, makeBriefingItem, makeJob, makeToday } from "@/lib/today/test-fixtures";
import { buildTodayVoice, strongestBriefingItem } from "@/lib/today/voice";

/** `makeInput` son toplaması 1 Eki: bundan ÖNCE üretilen not "yeni veri geldi" diye bayattır. */
const BEFORE_COLLECTION = "2026-09-30T12:00:00.000Z";

describe("buildTodayVoice", () => {
  it("ilk cümle şablon (bu hafta yaptıklarım), ikinci cümle en güçlü not", () => {
    const voice = buildTodayVoice(
      makeToday({ briefing: makeBriefing() }, { activity: { analyzedVideos: 6, truncated: false }, newIdeas: 3, plan: makePlan() }),
    );
    expect(voice.lead).toBe("Bu hafta 6 video inceledim, 3 fikir çıkardım; 5 Eki – 11 Eki planın hazır.");
    expect(voice.link).toEqual({ label: "Planı aç", href: "/bu-hafta?hafta=2026-10-05" });
    expect(voice.note).toMatchObject({ text: "Soruyla açtığın videolar daha çok izlendi.", confidence: "medium", evidence: ["c:ci-1"] });
    expect(voice.note?.stale).toBeUndefined();
  });

  it("bu hafta cümlesi yoksa 'neredeyiz' cümlesine düşer", () => {
    expect(buildTodayVoice(makeToday()).lead).toBe("Son 30 günde 20 video paylaştın, 14.800 izlenme aldın; önceki 30 güne göre %48 arttı.");
  });

  it("ölçülemeyen değer cümleye girmez, sıfır yazılmaz", () => {
    const voice = buildTodayVoice(makeToday({}, { overview: makeOverview({ posts: 4 }) }));
    expect(voice.lead).toBe("Son 30 günde 4 video paylaştın.");
    expect(voice.lead).not.toMatch(/\b0\b|izlenme|undefined/);
    const idle = buildTodayVoice(makeToday({}, { activity: { analyzedVideos: 0, truncated: false }, newIdeas: 0 }));
    expect(idle.lead).not.toMatch(/\b0 (video|fikir)/);
  });

  it("hiçbir parça okunamadıysa söz boş kalır (uydurma cümle yok)", () => {
    const voice = buildTodayVoice(makeToday({}, { overview: undefined }));
    expect(voice.lead).toBeUndefined();
    expect(voice.note).toBeUndefined();
  });

  it("en güçlü not: güveni en yüksek, eşitlikte ilk gelen", () => {
    const items = [
      makeBriefingItem({ headline: "a", confidence: "low" }),
      makeBriefingItem({ headline: "b", confidence: "high" }),
      makeBriefingItem({ headline: "c", confidence: "high" }),
    ];
    expect(strongestBriefingItem(items)?.headline).toBe("b");
    expect(strongestBriefingItem([])).toBeUndefined();
  });

  it("bayat not sebebiyle birlikte gelir: sonradan yeni veri / çok eski", () => {
    const newData = buildTodayVoice(makeToday({ briefing: makeBriefing(undefined, BEFORE_COLLECTION) }));
    expect(newData.note?.stale).toEqual({ reason: "new_data", text: "Bundan sonra yeni veri geldi; notlarımı güncelleyeceğim." });
    const old = buildTodayVoice(makeToday({ briefing: makeBriefing(undefined, "2026-09-20T12:00:00.000Z") }, { lastCollectedAt: undefined }));
    expect(old.note?.stale).toEqual({ reason: "too_old", text: "Notlarım eski veriye dayanıyor." });
  });

  it("boş çalışma alanında yalnız ilk-bakış cümlesi, not yok", () => {
    expect(buildTodayVoice(makeToday({ briefing: makeBriefing() }, { accounts: [] }))).toEqual({ lead: EMPTY_WHERE_TEXT });
  });
});

describe("buildToday: durum", () => {
  it("boş çalışma alanı (kurulum kartları olsa da)", () => {
    const today = buildToday(makeToday({}, { accounts: [] }));
    expect(today.state).toEqual({ kind: "empty", text: EMPTY_WHERE_TEXT });
    expect(today.queue.map((card) => card.kind)).toEqual(["connect_account", "setup_account_type"]);
  });

  it("karar var: sayıyı söyler; bayatlık notta kalır", () => {
    const today = buildToday(makeToday({ pendingJobs: [makeJob()], briefing: makeBriefing(undefined, BEFORE_COLLECTION) }));
    expect(today.state).toEqual({ kind: "decisions", text: "1 kararın var." });
    expect(today.voice.note?.stale?.reason).toBe("new_data");
  });

  it("karar yok: 'şu an senden bir şey beklemiyorum'", () => {
    expect(buildToday(makeToday({ briefing: makeBriefing() })).state).toEqual({ kind: "clear", text: NO_ASKS_TEXT });
    expect(buildToday(makeToday()).state.kind).toBe("clear");
  });

  it("karar yok ve notlar bayat: veri bayat", () => {
    const today = buildToday(makeToday({ briefing: makeBriefing(undefined, BEFORE_COLLECTION) }));
    expect(today.state).toEqual({ kind: "stale", text: "Bundan sonra yeni veri geldi; notlarımı güncelleyeceğim." });
  });
});
