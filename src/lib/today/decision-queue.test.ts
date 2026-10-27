import { describe, expect, it } from "vitest";

import { makePlan, SLOT_AT } from "@/components/weekly-plan/test-fixtures";
import { isBriefingRef } from "@/lib/domain/briefing-refs";
import type { WeekReview } from "@/lib/domain/outcomes";
import { makeOverview } from "@/lib/overview/test-fixtures";
import { PANEL_JARGON, PLAIN_TERMS } from "@/lib/plain-language";
import { buildDecisionQueue } from "@/lib/today/decision-queue";
import { makeBriefing, makeJob, makeLink, makeToday, NOW, WORKSPACE } from "@/lib/today/test-fixtures";
import { DECISION_KINDS, type DecisionCard, type TodayInput, type TodayJobsState } from "@/lib/today/types";

/** Slot (8 Eki 23:00 UTC) geçmiş: Cuma 9 Eki sabahı. */
const AFTER_SLOT = new Date("2026-10-09T09:00:00.000Z");

const kinds = (input: TodayInput) => buildDecisionQueue(input).map((card) => card.kind);

/** İşler panelden başlatılabiliyor, süren iş yok. */
const JOBS_OPEN: TodayJobsState = { canRun: true, busy: false };
/** Gelecek haftanın (12 Eki) planı; `makePlan()` varsayılanı içinde bulunulan haftanınkidir (5 Eki). */
const NEXT_WEEK_PLAN = () => makePlan({ weekStart: "2026-10-12" });
const routineCard = (input: TodayInput): DecisionCard | undefined => buildDecisionQueue(input).find((card) => card.kind === "run_routine");

/** Yönetici kartları dahil dolu girdi. */
const busy = (operator: boolean): TodayInput =>
  makeToday(
    { now: AFTER_SLOT, suggestedLinks: [makeLink({ ideaId: "idea-3" })], pendingJobs: [makeJob()], rivalCandidates: 2 },
    { operator, plan: makePlan(), pendingApproval: 1, suggestedLinks: 1, measurementDueDays: [7], measureCapApproved: false },
  );

describe("buildDecisionQueue: sıra ve kimlik", () => {
  it("hiçbir iş yoksa kuyruk boş", () => {
    expect(buildDecisionQueue(makeToday())).toEqual([]);
  });

  it("öncelik sırası: yayın onayı · eşleşme · bağlantı · ölçüm bütçesi · rakip adayları", () => {
    // Slotu geçen 1., 2. ve 4. madde bağlantı sorar (3. maddenin önerisi var); sıradaki çekim 1. madde olduğu için ayrıca sorulmaz.
    expect(kinds(busy(true))).toEqual([
      "approve_publish",
      "confirm_link",
      "paste_reel_link",
      "paste_reel_link",
      "paste_reel_link",
      "measurement_budget",
      "review_rivals",
    ]);
  });

  it("sıradaki çekim bağlantı sorusundan sonra, yönetici kartlarından önce gelir", () => {
    const plan = makePlan();
    // 1. maddenin günü geçti, 2. maddenin slotu gelecek hafta: 1. için bağlantı sorulur, sıradaki çekim yine 1. olduğundan düşer.
    plan.items[1] = { ...plan.items[1], slotAt: "2026-10-15T23:00:00.000Z" };
    plan.items = plan.items.slice(0, 2);
    expect(kinds(makeToday({ now: AFTER_SLOT }, { plan }))).toEqual(["paste_reel_link"]);
    const input = makeToday({ pendingJobs: [makeJob()], rivalCandidates: 1 }, { operator: true, plan: makePlan() });
    expect(kinds(input)).toEqual(["approve_publish", "shoot_next", "review_rivals"]);
  });

  it("kimlikler kararlı ve tekil: aynı girdi aynı kimlikleri verir", () => {
    const ids = buildDecisionQueue(busy(true)).map((card) => card.id);
    expect(ids).toEqual(buildDecisionQueue(busy(true)).map((card) => card.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "approve_publish:job-1",
      "confirm_link:link-1",
      "paste_reel_link:idea-1",
      "paste_reel_link:idea-2",
      "paste_reel_link:idea-4",
      "measurement_budget",
      "review_rivals",
    ]);
  });

  it("her kart kapalı listeden bir tür, düz dil metin ve geçerli kanıt taşır", () => {
    const setup = makeToday({ workspace: { ...WORKSPACE, nicheBrief: undefined } }, { accounts: [] });
    const shoot = makeToday({}, { plan: makePlan() });
    const routine = makeToday({ jobs: JOBS_OPEN }, { operator: true, plan: null });
    const flow = makeToday({ onboarding: { step: "choose_rivals", next: "start_build" } });
    const cards = [busy(true), setup, shoot, routine, flow].flatMap(buildDecisionQueue);
    expect(new Set(cards.map((card) => card.kind))).toEqual(new Set(DECISION_KINDS));
    for (const card of cards) {
      expect(card.title).not.toBe("");
      expect(`${card.title} ${card.body}`).not.toMatch(PANEL_JARGON);
      expect(`${card.title} ${card.body}`).not.toMatch(/!|undefined|NaN/);
      expect(card.evidence.every(isBriefingRef)).toBe(true);
    }
  });
});

describe("buildDecisionQueue: müşteri modu", () => {
  it("para konuşan kart (ölçüm bütçesi, rakip adayları) üretilmez", () => {
    const cards = buildDecisionQueue(busy(false));
    expect(cards.map((card) => card.kind)).toEqual(["approve_publish", "confirm_link", "paste_reel_link", "paste_reel_link", "paste_reel_link"]);
    expect(cards.some((card) => card.operatorOnly)).toBe(false);
    expect(cards.map((card) => card.body).join(" ")).not.toMatch(/bütçe|USD|\$|Apify|npm/i);
  });

  it("yönetici modunda bütçe onaylıysa bütçe kartı yok", () => {
    expect(kinds(makeToday({}, { operator: true, measurementDueDays: [3], measureCapApproved: true }))).toEqual([]);
  });
});

describe("buildDecisionQueue: kart türleri", () => {
  it("yayın onayı: iş başına kart, onay eylemi ve planlanan zaman", () => {
    const [card] = buildDecisionQueue(makeToday({ pendingJobs: [makeJob({ scheduledFor: "2026-10-06T16:00:00.000Z", ideaId: "idea-2" })] }));
    expect(card.primary).toEqual({ kind: "action", action: "approvePublishJob", label: "Yayını onayla", payload: { jobId: "job-1" } });
    expect(card.secondary).toEqual({ kind: "link", label: "Yayını aç", href: "/yayin" });
    expect(card.body).toBe("“Yeni video” açıklamalı video yayına çıkmak için onayını bekliyor. Planlanan yayın: 6 Eki 2026 19:00.");
    expect(card.evidence).toEqual(["idea:idea-2"]);
  });

  it("yayın onayı: zaman yoksa uydurulmaz; uyum denetiminden geçmeyen işte onay düğmesi kapalı, sebep yazılı", () => {
    const [plain, blocked] = buildDecisionQueue(makeToday({ pendingJobs: [makeJob(), makeJob({ id: "job-2", paidPartnership: true })] }));
    expect(plain.body).toContain("Onaylayınca hemen yayınlanır.");
    expect(plain.blockedReason).toBeUndefined();
    expect(blocked.primary).toEqual({ kind: "link", label: "Yayını düzelt", href: "/yayin?duzelt=job-2#is-job-2" });
    expect(blocked.blockedReason).toContain("Uyum denetimi başarısız");
    expect(blocked.secondary).toBeUndefined();
  });

  it("yayın onayı: işler okunamadıysa sayıdan tek özet kartı", () => {
    const cards = buildDecisionQueue(makeToday({ pendingJobs: undefined }, { pendingApproval: 2 }));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "approve_publish:all", body: "2 yayın senin onayını bekliyor.", primary: { kind: "link", href: "/yayin" } });
    expect(buildDecisionQueue(makeToday({ pendingJobs: undefined }))).toEqual([]);
  });

  it("eşleşme önerisi: onayla / bu değil, fikir ve video kanıtı; fikir plandaysa adıyla anılır", () => {
    const [card] = buildDecisionQueue(makeToday({ suggestedLinks: [makeLink()] }, { plan: makePlan() }));
    expect(card.primary).toEqual({
      kind: "action",
      action: "resolveIdeaLinkAction",
      label: "Evet, bu fikir",
      payload: { linkId: "link-1", decision: "confirm" },
    });
    expect(card.secondary).toMatchObject({ action: "resolveIdeaLinkAction", payload: { linkId: "link-1", decision: "reject" } });
    expect(card.evidence).toEqual(["idea:idea-1", "c:ci-9"]);
    expect(card.body).toBe(
      "Yayınladığın bir videonun “Fikir 1” fikrinden çıktığını tahmin ettim. Videonun açıklaması: “Sabah rutini”. Doğruysa onayla; sonucunu bu fikrin altında takip ederim.",
    );
    const [unknown] = buildDecisionQueue(makeToday({ suggestedLinks: [makeLink({ ideaId: "idea-99", content: undefined, contentItemId: undefined })] }));
    expect(unknown.body).toBe("Yayınladığın bir videonun hangi fikirden çıktığını tahmin ettim. Doğruysa onayla; sonucunu bu fikrin altında takip ederim.");
    expect(unknown.evidence).toEqual(["idea:idea-99"]);
  });

  it("bağlantı yapıştırma: yalnız günü geçmiş, yayınlanmamış, önerisi olmayan plan maddesi; eylem bağlantı ister", () => {
    expect(Date.parse(SLOT_AT)).toBeLessThan(AFTER_SLOT.getTime());
    const plan = makePlan();
    plan.items[1].idea = { ...plan.items[1].idea, status: "published" };
    plan.items[2].idea = { ...plan.items[2].idea, status: "dismissed" };
    const review = { items: [{ ideaId: "idea-4", title: "Fikir 4", suggestionCount: 1, checkpoints: [], directions: [] }] } as unknown as WeekReview;
    const cards = buildDecisionQueue(makeToday({ now: AFTER_SLOT }, { plan, review }));
    expect(cards.map((card) => card.id)).toEqual(["paste_reel_link:idea-1"]);
    expect(cards[0].primary).toEqual({
      kind: "action",
      action: "linkIdeaToReelAction",
      label: "Bağlantıyı kaydet",
      payload: { ideaId: "idea-1" },
      input: "url",
    });
    expect(cards[0].secondary).toEqual({ kind: "link", label: "Senaryoyu aç", href: "/fikirler?id=idea-1" });
    expect(cards[0].evidence).toEqual(["idea:idea-1", "plan:2026-10-05"]);
  });

  it("bağlantı yapıştırma: günü gelmemiş ya da çok eski plan için sorulmaz", () => {
    expect(kinds(makeToday({ now: NOW }, { plan: makePlan() }))).toEqual(["shoot_next"]);
    const old = makeToday({ now: new Date("2026-11-20T09:00:00.000Z") }, { plan: makePlan(), currentWeekStart: "2026-11-16" });
    expect(kinds(old)).toEqual([]);
  });

  it("sıradaki çekim: Genel bakışla aynı cümle, senaryo bağlantısı, plan güveni", () => {
    const [card] = buildDecisionQueue(makeToday({}, { plan: makePlan() }));
    expect(card).toMatchObject({
      id: "shoot_next:idea-1",
      body: "Sıradaki video: “Fikir 1”. Planlanan yayın: Per 19:00 ET (Cum 02:00 İstanbul).",
      primary: { kind: "link", label: "Senaryoyu aç", href: "/fikirler?id=idea-1" },
      evidence: ["idea:idea-1", "plan:2026-10-05"],
      confidence: "medium",
    });
    expect(buildDecisionQueue(makeToday({}, { plan: makePlan({ confidence: undefined }) }))[0].confidence).toBeUndefined();
  });

  it("ölçüm bütçesi: yalnız yönetici ve bütçe onaysızken, ölçümü gelen video varsa", () => {
    const [card] = buildDecisionQueue(makeToday({}, { operator: true, measurementDueDays: [3, 7], measureCapApproved: false }));
    expect(card).toMatchObject({ id: "measurement_budget", operatorOnly: true, primary: { kind: "link", href: "/ayarlar" } });
    expect(kinds(makeToday({}, { operator: true, measurementDueDays: [], measureCapApproved: false }))).toEqual([]);
    expect(kinds(makeToday({}, { operator: true, measurementDueDays: [7], measureCapApproved: undefined }))).toEqual([]);
  });
});

describe("buildDecisionQueue: haftalık tur kartı (iş başlatır)", () => {
  const stale = makeBriefing(undefined, "2026-09-20T12:00:00.000Z");

  it("gelecek haftanın planı yoksa çıkar: onaysız haftalık turu ister, İşler'e ikincil bağlantı verir; kuyruğun SONUNDA", () => {
    const card = routineCard(makeToday({ jobs: JOBS_OPEN }, { operator: true, plan: makePlan() }));
    expect(card).toMatchObject({
      id: "run_routine",
      operatorOnly: true,
      primary: { kind: "action", action: "requestJobAction", label: "Haftalık turu başlat", payload: { kind: "routine" } },
      secondary: { kind: "link", href: "/isler" },
    });
    expect(card?.body).toContain("Gelecek haftanın planı henüz hazır değil.");
    expect(card?.body).not.toContain(PLAIN_TERMS.stale.meaning);
    expect(card?.body).toContain("para harcamaz");
    // Hiç plan yoksa da aynı kart.
    expect(routineCard(makeToday({ jobs: JOBS_OPEN }, { operator: true, plan: null }))?.id).toBe("run_routine");
    expect(kinds({ ...busy(true), jobs: JOBS_OPEN }).slice(-3)).toEqual(["measurement_budget", "review_rivals", "run_routine"]);
  });

  it("notlar bayatsa çıkar (çok eski ya da sonradan yeni veri gelmiş); taze not + gelecek haftanın planı varken çıkmaz", () => {
    const old = routineCard(makeToday({ jobs: JOBS_OPEN, briefing: stale }, { operator: true, plan: NEXT_WEEK_PLAN() }));
    expect(old?.body).toContain(PLAIN_TERMS.stale.meaning);
    expect(old?.body).not.toContain("Gelecek haftanın planı");
    const newData = makeToday({ jobs: JOBS_OPEN, briefing: makeBriefing() }, { operator: true, plan: NEXT_WEEK_PLAN(), lastCollectedAt: "2026-10-05T08:00:00.000Z" });
    expect(routineCard(newData)).toBeDefined();
    expect(routineCard(makeToday({ jobs: JOBS_OPEN, briefing: makeBriefing() }, { operator: true, plan: NEXT_WEEK_PLAN() }))).toBeUndefined();
    // İki sebep birlikte: ikisi de söylenir.
    const both = routineCard(makeToday({ jobs: JOBS_OPEN, briefing: stale }, { operator: true, plan: makePlan() }));
    expect(both?.body).toContain(`${PLAIN_TERMS.stale.meaning} Gelecek haftanın planı henüz hazır değil.`);
  });

  it("okunamayan parça sebep sayılmaz: plan ya da hafta bilinmiyorsa 'plan yok' denmez; hiç not yoksa 'bayat' denmez", () => {
    expect(routineCard(makeToday({ jobs: JOBS_OPEN }, { operator: true, plan: undefined }))).toBeUndefined();
    expect(routineCard(makeToday({ jobs: JOBS_OPEN }, { operator: true, plan: makePlan(), currentWeekStart: undefined }))).toBeUndefined();
    expect(routineCard(makeToday({ jobs: JOBS_OPEN, briefing: null }, { operator: true, plan: NEXT_WEEK_PLAN() }))).toBeUndefined();
  });

  it("yalnız yönetici modunda VE işler açıkken VE süren iş yokken: aksi halde kart yok", () => {
    const need = { operator: true, plan: null } as const;
    expect(routineCard(makeToday({ jobs: JOBS_OPEN }, { ...need, operator: false }))).toBeUndefined();
    expect(routineCard(makeToday({}, need))).toBeUndefined();
    expect(routineCard(makeToday({ jobs: { canRun: false, busy: false } }, need))).toBeUndefined();
    expect(routineCard(makeToday({ jobs: { canRun: true, busy: true } }, need))).toBeUndefined();
  });

  it("boş çalışma alanında çıkmaz: önce kurulum adımları", () => {
    expect(kinds(makeToday({ jobs: JOBS_OPEN }, { operator: true, plan: null, accounts: [] }))).toEqual(["connect_account", "setup_account_type"]);
  });
});

describe("buildDecisionQueue: rakipsiz hesap ve boş çalışma alanı", () => {
  it("rakipsiz hesapta (aday yok ya da okunmadı) rakip kartı üretilmez; diğer kartlar çalışır", () => {
    for (const rivalCandidates of [0, undefined]) {
      const input = makeToday({ rivalCandidates, workspace: { ...WORKSPACE, accountType: "creator" } }, { operator: true, plan: makePlan() });
      expect(kinds(input)).toEqual(["shoot_next"]);
    }
  });

  it("boş çalışma alanı: hesabı bağla + ilk kurulum adımları (konu, hesap türü)", () => {
    const cards = buildDecisionQueue(makeToday({ workspace: { ...WORKSPACE, nicheBrief: " " } }, { accounts: [] }));
    expect(cards.map((card) => card.id)).toEqual(["connect_account", "setup_niche", "setup_account_type"]);
    expect(cards.every((card) => card.primary.kind === "link" && card.primary.href === "/ayarlar")).toBe(true);
    expect(cards[2].body).toContain("“İşletme / koç”");
  });

  it("hesap türü kartı türün kendi adını söyler; konu yazılmışsa konu kartı yok", () => {
    const input = makeToday({ workspace: { ...WORKSPACE, accountType: "creator" } }, { lastCollectedAt: undefined, overview: makeOverview({}) });
    const cards = buildDecisionQueue(input);
    expect(cards.map((card) => card.id)).toEqual(["setup_account_type"]);
    expect(cards[0].body).toContain("“İçerik üreticisi”");
  });

  it("veri olan çalışma alanında kurulum kartı çıkmaz; hesaplar okunamadıysa 'bağla' denmez", () => {
    expect(kinds(makeToday({ workspace: { ...WORKSPACE, nicheBrief: undefined } }))).toEqual([]);
    expect(kinds(makeToday({}, { accounts: undefined }))).toEqual([]);
  });
});

describe("buildDecisionQueue: başlangıç akışı", () => {
  const empty = (): TodayInput => makeToday({ workspace: { ...WORKSPACE, nicheBrief: undefined } }, { accounts: [] });

  it("akış kullanıcıyı bekliyorsa kuyruğun başında tek kart: akışa götürür; ilk kurulum kartları (hesap, konu, tür) ayrıca sorulmaz", () => {
    const cards = buildDecisionQueue({ ...empty(), onboarding: { step: "review_account", next: "confirm_account" } });
    expect(cards.map((card) => card.id)).toEqual(["onboarding"]);
    expect(cards[0]).toMatchObject({ title: "İlk bakışı birlikte tamamlayalım", primary: { kind: "link", label: "Devam et", href: "/baslangic" }, operatorOnly: false });
    expect(`${cards[0].title} ${cards[0].body}`).not.toMatch(PANEL_JARGON);
  });

  it("akış sürüyorsa 'ilk bakışımı yapıyorum' der ve ilerlemeye götürür; karttan iş başlatılmaz", () => {
    for (const step of ["probing", "building"] as const) {
      const [card] = buildDecisionQueue({ ...makeToday(), onboarding: { step } });
      expect(card).toMatchObject({ kind: "onboarding", title: "İlk bakışımı yapıyorum", primary: { kind: "link", label: "İlerlemeyi gör", href: "/baslangic" } });
    }
  });

  it("akış kapalıysa (plan hazır / kurulu hesap) ya da okunamadıysa kart yok; kuyruk eskisi gibidir", () => {
    expect(kinds({ ...makeToday(), onboarding: { step: "done" } })).toEqual([]);
    expect(buildDecisionQueue({ ...empty(), onboarding: { step: "done" } }).map((card) => card.id)).toEqual(["connect_account", "setup_niche", "setup_account_type"]);
    expect(buildDecisionQueue(empty()).map((card) => card.id)).toEqual(["connect_account", "setup_niche", "setup_account_type"]);
  });

  it("açık akışta diğer kararlar yerinde kalır (kart yalnız en başa girer)", () => {
    expect(kinds({ ...busy(false), onboarding: { step: "blocked", next: "resume" } })[0]).toBe("onboarding");
    expect(kinds({ ...busy(false), onboarding: { step: "blocked", next: "resume" } }).slice(1)).toEqual(kinds(busy(false)));
  });
});
