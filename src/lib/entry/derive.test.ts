import { describe, expect, it } from "vitest";

import { ENTRY_COPY } from "@/lib/copy/entry";
import { deriveEntry, stageOf } from "@/lib/entry/derive";
import type { EntryVideoInput } from "@/lib/entry/types";
import { PANEL_JARGON } from "@/lib/plain-language";
import type { WeeklyFlowStep } from "@/lib/weekly-flow/types";

const flow = (states: Partial<Record<WeeklyFlowStep["key"], WeeklyFlowStep["state"]>> = {}): WeeklyFlowStep[] =>
  (["collect", "analyze", "plan", "select", "ticket"] as const).map((key) => ({ key, state: states[key] ?? "done", reason: `${key} gerekçe` }));

const video = (id: string, order?: EntryVideoInput["order"], ideaStatus: EntryVideoInput["ideaStatus"] = "new"): EntryVideoInput => ({
  ideaId: id,
  title: `Fikir ${id}`,
  rationale: "Neden",
  ideaStatus,
  ...(order ? { order } : {}),
});

const states = (view: ReturnType<typeof deriveEntry>) => view.steps.map((s) => s.state);

describe("stageOf", () => {
  it("fişsiz ya da türsüz fiş: karar bekliyor; tür seçilince senaryo; stüdyo durumları ileri taşır; yayınlanan takipte", () => {
    expect(stageOf(video("a"))).toBe("approve");
    expect(stageOf(video("a", { id: "o", status: "taslak" }))).toBe("approve");
    expect(stageOf(video("a", { id: "o", status: "taslak", kind: "ugc" }))).toBe("script");
    expect(stageOf(video("a", { id: "o", status: "uretiliyor", kind: "animasyon" }))).toBe("produce");
    expect(stageOf(video("a", { id: "o", status: "uretildi", kind: "animasyon" }))).toBe("share");
    expect(stageOf(video("a", { id: "o", status: "paylasildi", kind: "ugc" }))).toBe("track");
    expect(stageOf(video("a", undefined, "published"))).toBe("track");
  });
});

describe("deriveEntry", () => {
  it("plan hazır, kararsız video var: Analiz biter, Onayın sıra sende, gerisi bekler", () => {
    const view = deriveEntry({ flow: flow(), videos: [video("a"), video("b", { id: "o", status: "taslak", kind: "ugc" })] });
    expect(states(view)).toEqual(["done", "done", "active", "waiting", "waiting", "waiting", "waiting"]);
    expect(view.steps[2].reason).toBe(ENTRY_COPY.reasons.approve.active(1));
  });

  it("Analiz hiçbir zaman sıra sende değildir: bekleyen inceleme arka planda sürer", () => {
    const view = deriveEntry({ flow: flow({ analyze: "waiting" }), videos: [video("a")] });
    expect(view.steps[0].state).toBe("running");
    expect(view.steps[0].reason).toContain("analyze gerekçe");
  });

  it("hepsine karar verildi: hat en geride kalan videonun aşamasında; Üretim ve Takip arka planda sürer", () => {
    const script = deriveEntry({ flow: flow(), videos: [video("a", { id: "1", status: "taslak", kind: "ugc" }), video("b", { id: "2", status: "uretildi", kind: "animasyon" })] });
    expect(states(script)).toEqual(["done", "done", "done", "active", "waiting", "waiting", "waiting"]);
    const produce = deriveEntry({ flow: flow(), videos: [video("a", { id: "1", status: "uretiliyor", kind: "animasyon" })] });
    expect(produce.steps[4].state).toBe("running");
    const track = deriveEntry({ flow: flow(), videos: [video("a", undefined, "published")] });
    expect(states(track)).toEqual(["done", "done", "done", "done", "done", "done", "running"]);
  });

  it("plan yoksa: Plan sıra sende (sohbet eylemiyle), Onayın'dan sonrası bekler", () => {
    const f = flow({ plan: "active", select: "waiting", ticket: "waiting" });
    f[2] = { ...f[2], action: { kind: "chat", message: "Bu haftanın planını çıkar" } };
    const view = deriveEntry({ flow: f, videos: [] });
    expect(states(view)).toEqual(["done", "active", "waiting", "waiting", "waiting", "waiting", "waiting"]);
    expect(view.steps[1].action).toEqual({ kind: "chat", message: "Bu haftanın planını çıkar" });
  });

  it("sıra sende en çok bir adım", () => {
    const view = deriveEntry({ flow: flow({ plan: "active" }), videos: [video("a")] });
    expect(view.steps.filter((s) => s.state === "active")).toHaveLength(1);
  });
});

describe("ENTRY_COPY", () => {
  it("panel jargonu yok", () => {
    const texts: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") texts.push(v);
      else if (typeof v === "function") texts.push(String(v("x")));
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(ENTRY_COPY);
    expect(texts.filter((t) => PANEL_JARGON.test(t))).toEqual([]);
  });
});
