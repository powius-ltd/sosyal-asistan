import { describe, expect, it } from "vitest";

import { makeOverview } from "@/lib/overview/test-fixtures";
import { EMPTY_WHERE_TEXT } from "@/lib/overview/summary";
import { PANEL_JARGON } from "@/lib/plain-language";
import { ONBOARDING_ACTION_PLAIN, ONBOARDING_REASON_PLAIN, ONBOARDING_STEP_PLAIN } from "@/lib/plain-language-onboarding";
import { buildDecisionQueue } from "@/lib/today/decision-queue";
import { buildToday } from "@/lib/today/state";
import { makeToday } from "@/lib/today/test-fixtures";
import type { TodayInput } from "@/lib/today/types";

/** Hesap eklenmiş ama hiç bakılmamış: ölçülmüş gösterge yok, toplama yok (örnek veride taze hesap böyle görünür). */
const untouched = (patch: Partial<TodayInput> = {}, operator = false): TodayInput =>
  makeToday(patch, { operator, overview: makeOverview({}), lastCollectedAt: undefined });

describe("Bugün: gerçekten boş hesap (D1-01)", () => {
  it("akış açıkken ekran yalnız akış kartını ve boş durumu söyler: 'planın hazır' / 'X kararın var' çıkmaz", () => {
    for (const operator of [false, true]) {
      const today = buildToday(untouched({ onboarding: { step: "add_account", next: "add_account" }, rivalCandidates: 3 }, operator));
      expect(today.state.kind).toBe("empty");
      expect(today.voice.lead).toBe(EMPTY_WHERE_TEXT);
      expect(today.voice.note).toBeUndefined();
      expect(today.queue.map((card) => card.id)).toEqual(["onboarding"]);
      expect(`${today.voice.lead} ${today.state.text}`).not.toMatch(/planın hazır|kararın var/);
    }
  });
});

describe("Bugün: akış durduğunda neden söylenir (D1-02)", () => {
  it("durdu + neden: kart 'Burada durdum' der, akışın kendi neden cümlesini söyler, düğme sıradaki eylemin adıyla akışa götürür", () => {
    const [card] = buildDecisionQueue(untouched({ onboarding: { step: "blocked", reason: "account_private", next: "start_probe" } }));
    expect(card).toMatchObject({
      kind: "onboarding",
      title: ONBOARDING_STEP_PLAIN.blocked.title,
      body: ONBOARDING_REASON_PLAIN.account_private,
      primary: { kind: "link", label: ONBOARDING_ACTION_PLAIN.start_probe, href: "/baslangic" },
    });
    expect(card.title).not.toBe("İlk bakışı birlikte tamamlayalım");
    expect(`${card.title} ${card.body}`).not.toMatch(PANEL_JARGON);
  });

  it("her neden kendi cümlesiyle; neden ya da eylem yoksa akışın genel cümlesi ve 'Devam et'", () => {
    const [bare] = buildDecisionQueue(untouched({ onboarding: { step: "blocked" } }));
    expect(bare).toMatchObject({ body: ONBOARDING_STEP_PLAIN.blocked.lead, primary: { label: "Devam et" } });
    const [notFound] = buildDecisionQueue(untouched({ onboarding: { step: "blocked", reason: "account_not_found", next: "add_account" } }));
    expect(notFound).toMatchObject({ body: ONBOARDING_REASON_PLAIN.account_not_found, primary: { label: ONBOARDING_ACTION_PLAIN.add_account } });
  });
});

describe("Bugün: benzer hesap önerisi kartı (D1-08)", () => {
  it("'aday' demez: sözlükteki terimle ('3 benzer hesap önerisi'); akış açıkken akış sorduğu için kart yok", () => {
    const input = makeToday({ rivalCandidates: 3 }, { operator: true });
    const [card] = buildDecisionQueue(input);
    expect(card.kind).toBe("review_rivals");
    expect(card.body).toContain("3 benzer hesap önerisi kararını bekliyor");
    expect(`${card.title} ${card.body}`).not.toMatch(PANEL_JARGON);
    expect(buildDecisionQueue({ ...input, onboarding: { step: "choose_rivals", next: "start_build" } }).map((c) => c.kind)).toEqual(["onboarding"]);
  });
});
