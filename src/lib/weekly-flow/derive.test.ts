import { describe, expect, it } from "vitest";
import { WEEKLY_FLOW_COPY } from "@/lib/copy/weekly-flow";
import { PANEL_JARGON } from "@/lib/plain-language";
import { ROUTES } from "@/lib/routes";
import { deriveWeeklyFlow } from "@/lib/weekly-flow/derive";
import type { WeeklyFlowInput, WeeklyFlowState } from "@/lib/weekly-flow/types";

const NOW = new Date("2026-10-28T09:00:00Z");
const WEEK = "2026-10-26";
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

/** Her şey bitmiş taban; testler tek tek bozar. */
const done = (over: Partial<WeeklyFlowInput> = {}): WeeklyFlowInput => ({
  now: NOW,
  lastCollectedAt: ago(2),
  collectEveryDays: 14,
  activeJobKinds: [],
  pendingAnalysis: 0,
  currentWeekStart: WEEK,
  plan: { weekStart: WEEK, ideas: [{ id: "a", status: "saved" }, { id: "b", status: "new" }] },
  ticketIdeaIds: ["a"],
  ...over,
});

const states = (input: WeeklyFlowInput): WeeklyFlowState[] => deriveWeeklyFlow(input).map((s) => s.state);
const step = (input: WeeklyFlowInput, key: string) => deriveWeeklyFlow(input).find((s) => s.key === key)!;

describe("deriveWeeklyFlow", () => {
  it("her şey bitmişse beş adım da done, etkin adım yok", () => {
    expect(states(done())).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("plan hazırken İncele sürse de Seç etkin; İncele kendi durumunu söyleyerek bekler", () => {
    const input = done({ pendingAnalysis: 55, plan: { weekStart: WEEK, ideas: [{ id: "b", status: "new" }] } });
    expect(step(input, "select")).toMatchObject({ state: "active", reason: WEEKLY_FLOW_COPY.reasons.select.missing, action: { kind: "chat" } });
    expect(step(input, "analyze")).toMatchObject({ state: "waiting", reason: "55 video inceleme bekliyor." });
    expect(step(done({ activeJobKinds: ["analyze"], plan: { weekStart: WEEK, ideas: [] } }), "analyze").reason).toBe(WEEKLY_FLOW_COPY.reasons.analyze.running);
  });

  it("plan hazırken eski veri ve inceleme varken de Fiş etkin", () => {
    const input = done({ lastCollectedAt: ago(30), pendingAnalysis: 3, ticketIdeaIds: [] });
    expect(states(input)).toEqual(["waiting", "waiting", "done", "done", "active"]);
    expect(step(input, "collect").reason).toBe(WEEKLY_FLOW_COPY.reasons.collect.stale);
  });

  it("plan yokken eski kural: İncele bekleyen video etkin, Seç 'önce plan' der", () => {
    const input = done({ pendingAnalysis: 2, plan: { weekStart: "2026-10-19", ideas: [] } });
    expect(step(input, "analyze").state).toBe("active");
    expect(step(input, "select")).toMatchObject({ state: "waiting", reason: WEEKLY_FLOW_COPY.reasons.select.waiting });
  });

  it("Topla: eski veri etkin + sohbet eylemi; ardıkiler waiting", () => {
    const s = deriveWeeklyFlow(done({ lastCollectedAt: ago(20) }));
    expect(s[0]).toMatchObject({ state: "active", action: { kind: "chat", message: "Yeni verileri topla" } });
    expect(s[1].state).toBe("done"); // kendi koşulu sağlanıyor
    expect(step(done({ lastCollectedAt: ago(20), pendingAnalysis: 3 }), "analyze").state).toBe("waiting");
  });

  it("Topla: sıklık sınırında bitmiş, ötesinde etkin", () => {
    expect(step(done({ lastCollectedAt: ago(14) }), "collect").state).toBe("done");
    expect(step(done({ lastCollectedAt: ago(15) }), "collect").state).toBe("active");
    expect(step(done({ lastCollectedAt: ago(5), collectEveryDays: 3 }), "collect").state).toBe("active");
  });

  it("Topla: hiç toplanmadı = etkin; iş sıradaysa eylem yok; okunamadı = blocked", () => {
    expect(step(done({ lastCollectedAt: null }), "collect")).toMatchObject({ state: "active", action: { kind: "chat" } });
    const running = step(done({ lastCollectedAt: ago(30), activeJobKinds: ["collect"] }), "collect");
    expect(running.state).toBe("active");
    expect(running.action).toBeUndefined();
    expect(step(done({ lastCollectedAt: undefined }), "collect").state).toBe("blocked");
  });

  it("İncele: bekleyen video etkin; iş koşuyorsa etkin ama eylemsiz; okunamadı blocked", () => {
    expect(step(done({ pendingAnalysis: 4 }), "analyze")).toMatchObject({ state: "active", reason: "4 video inceleme bekliyor.", action: { kind: "chat" } });
    const running = step(done({ pendingAnalysis: 0, activeJobKinds: ["analyze"] }), "analyze");
    expect(running.state).toBe("active");
    expect(running.action).toBeUndefined();
    expect(step(done({ pendingAnalysis: undefined }), "analyze").state).toBe("blocked");
  });

  it("Plan: bu haftanın planı yoksa etkin; geçen haftanınki sayılmaz; okunamadı blocked", () => {
    expect(step(done({ plan: null }), "plan")).toMatchObject({ state: "active", action: { kind: "chat", message: "Bu haftanın planını çıkar" } });
    expect(step(done({ plan: { weekStart: "2026-10-19", ideas: [] } }), "plan").state).toBe("active");
    expect(step(done({ plan: undefined }), "plan").state).toBe("blocked");
    expect(step(done({ plan: null, activeJobKinds: ["plan"] }), "plan").action).toBeUndefined();
  });

  it("Seç: plan var ama seçili fikir yok → etkin, sohbet + plan sayfası; sonrakiler waiting", () => {
    const input = done({ plan: { weekStart: WEEK, ideas: [{ id: "a", status: "new" }, { id: "b", status: "dismissed" }] } });
    expect(deriveWeeklyFlow(input)[3]).toMatchObject({
      state: "active",
      action: { kind: "chat", message: "Bu hafta hangi fikri çekmeliyim?" },
      secondaryAction: { kind: "link", href: ROUTES.thisWeek },
    });
    expect(step(input, "ticket").state).toBe("waiting");
  });

  it("Seç: saved / scripted / scheduled / published seçilmiş sayılır", () => {
    for (const status of ["saved", "scripted", "scheduled", "published"] as const) {
      expect(step(done({ plan: { weekStart: WEEK, ideas: [{ id: "a", status }] } }), "select").state).toBe("done");
    }
  });

  it("Fiş: seçilenin fişi yoksa etkin; hepsi varsa done; fiş kaydı okunamadı blocked", () => {
    const two = { weekStart: WEEK, ideas: [{ id: "a", status: "saved" as const }, { id: "b", status: "scripted" as const }] };
    expect(step(done({ plan: two, ticketIdeaIds: ["a"] }), "ticket")).toMatchObject({ state: "active", reason: "Seçtiğin fikrin fişi henüz yok.", action: { kind: "chat" } });
    expect(step(done({ plan: two, ticketIdeaIds: new Set(["a", "b"]) }), "ticket").state).toBe("done");
    expect(step(done({ ticketIdeaIds: undefined }), "ticket").state).toBe("blocked");
  });

  it("kaçınılmaz değişmez: bitmemiş akışta etkin + engelli TAM 1; plan yokken öncekiler done, sonrakiler waiting/done", () => {
    const collects = [ago(1), ago(30), null, undefined];
    const pendings = [0, 5, undefined];
    const plans = [null, undefined, { weekStart: WEEK, ideas: [] }, { weekStart: WEEK, ideas: [{ id: "a", status: "saved" as const }] }];
    const tickets = [undefined, [], ["a"]];
    for (const lastCollectedAt of collects)
      for (const pendingAnalysis of pendings)
        for (const plan of plans)
          for (const ticketIdeaIds of tickets) {
            const s = deriveWeeklyFlow(done({ lastCollectedAt, pendingAnalysis, plan, ticketIdeaIds }));
            const front = s.filter((x) => x.state === "active" || x.state === "blocked");
            const allDone = s.every((x) => x.state === "done");
            expect(front.length).toBe(allDone ? 0 : 1);
            const at = s.findIndex((x) => x.state === "active" || x.state === "blocked");
            const planReady = plan !== null && plan !== undefined;
            if (planReady && at >= 0) expect(at).toBeGreaterThanOrEqual(allDone ? 0 : s.slice(3).some((x) => x.state !== "done") ? 3 : 0);
            if (at >= 0 && !planReady) {
              expect(s.slice(0, at).every((x) => x.state === "done")).toBe(true);
              expect(s.slice(at + 1).every((x) => x.state === "done" || x.state === "waiting")).toBe(true);
            }
          }
  });

  it("jargon yok: hiçbir sebep ve mesaj panel jargonu taşımaz", () => {
    const samples = [done({ lastCollectedAt: null, pendingAnalysis: 2, plan: null }), done({ pendingAnalysis: undefined }), done({ ticketIdeaIds: [] }), done()];
    for (const input of samples) {
      for (const s of deriveWeeklyFlow(input)) {
        expect(s.reason).not.toMatch(PANEL_JARGON);
        if (s.action?.kind === "chat") expect(s.action.message).not.toMatch(PANEL_JARGON);
      }
    }
    expect(JSON.stringify(WEEKLY_FLOW_COPY.stepNames)).not.toMatch(PANEL_JARGON);
  });
});
