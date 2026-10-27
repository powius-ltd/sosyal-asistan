import { describe, expect, it } from "vitest";

import { ONBOARDING_ADD_HREF, ONBOARDING_ADD_PARAM } from "@/components/onboarding/add-intent";
import { ONBOARDING_ROUTE_LENGTH, ONBOARDING_SCREENS, onboardingHeadingOf, onboardingMascotState, onboardingRoutePosition, onboardingScreenOf } from "@/components/onboarding/flow-view";
import { buildRivalOptions, preselectedRivalIds } from "@/components/onboarding/rival-options";
import type { DiscoveryCandidateView } from "@/lib/domain/competitor";
import { ONBOARDING_STEPS } from "@/lib/domain/onboarding";
import { PANEL_JARGON } from "@/lib/plain-language";
import {
  ONBOARDING_ADD_SCREEN_PLAIN,
  ONBOARDING_BLOCKED_PLAIN,
  ONBOARDING_DONE_PLAIN,
  ONBOARDING_PROGRESS_PLAIN,
  ONBOARDING_REVIEW_PLAIN,
  ONBOARDING_RIVALS_PLAIN,
  ONBOARDING_ROUTE_PLAIN,
  ONBOARDING_TODAY_BODY_PLAIN,
  ONBOARDING_TURN_PLAIN,
} from "@/lib/plain-language-onboarding";

describe("akış durumundan ekran", () => {
  it("her adımın bir ekranı var; adım URL'den değil durumdan gelir", () => {
    const screens = ONBOARDING_STEPS.map((step) => onboardingScreenOf({ step }, false));
    expect(screens).toEqual(["add", "probing", "review", "rivals", "building", "done", "blocked"]);
    expect(new Set(screens)).toEqual(new Set(ONBOARDING_SCREENS));
  });

  it("'başka hesap ekle' niyeti hangi adımda olunursa olunsun ekleme formunu açar", () => {
    for (const step of ONBOARDING_STEPS) expect(onboardingScreenOf({ step }, true)).toBe("add");
    expect(ONBOARDING_ADD_HREF).toBe(`/baslangic?${ONBOARDING_ADD_PARAM}=1`);
  });

  it("ilk incelemesi başlayamayan akış seçim ekranına döner; diğer duruşlar 'durdum' ekranındadır", () => {
    expect(onboardingScreenOf({ step: "blocked", next: "start_build" }, false)).toBe("rivals");
    for (const next of ["start_probe", "add_account", "resume"] as const) expect(onboardingScreenOf({ step: "blocked", next }, false)).toBe("blocked");
  });

  it("yol şeridi: beş durak, sırayla; akış kapanınca hepsi geçilmiş sayılır; duruşta çıkış yolunun durağı", () => {
    expect(ONBOARDING_ROUTE_PLAIN.stops).toHaveLength(ONBOARDING_ROUTE_LENGTH);
    const at = (screen: (typeof ONBOARDING_SCREENS)[number]) => onboardingRoutePosition(screen, { step: "done" });
    expect((["add", "probing", "review", "rivals", "building"] as const).map((screen) => at(screen).current)).toEqual([1, 2, 3, 4, 5]);
    expect(at("done")).toEqual({ current: 5, complete: true });
    expect(onboardingRoutePosition("blocked", { step: "blocked", next: "start_probe" }).current).toBe(2);
    expect(onboardingRoutePosition("blocked", { step: "blocked", next: "resume" }).current).toBe(5);
    expect(onboardingRoutePosition("blocked", { step: "blocked", next: "add_account" }).current).toBe(1);
  });

  it("başlık: duran akışta neden net yazılır; az video / öneri yok uyarıdır; plan çıkmadıysa 'hazır' denmez", () => {
    expect(onboardingHeadingOf("blocked", { reason: "account_private" })).toEqual({ title: "Burada durdum", lead: "Hesabın gizli görünüyor. Herkese açık yaparsan yeniden bakabilirim." });
    expect(onboardingHeadingOf("blocked", { reason: "account_not_found" }).lead).toContain("hesap bulamadım");
    expect(onboardingHeadingOf("review", { reason: "few_videos" })).toMatchObject({ title: "Bu sen misin?", notice: expect.stringContaining("az video") });
    expect(onboardingHeadingOf("review", {})).not.toHaveProperty("notice");
    expect(onboardingHeadingOf("rivals", { reason: "no_candidates" }).notice).toContain("bulamadım");
    expect(onboardingHeadingOf("rivals", { reason: "build_failed" }).notice).toBe("İlk incelemeyi tamamlayamadım.");
    expect(onboardingHeadingOf("done", { reason: "plan_ready" }).title).toBe("İlk planın hazır");
    expect(onboardingHeadingOf("done", { reason: "plan_not_ready" })).toEqual({ title: "Videolarını inceledim; plan çıkarabilmem için biraz daha veri gerekiyor.", lead: "" });
    expect(onboardingHeadingOf("done", { reason: "legacy" }).title).toBe("Bu hesap zaten kurulu.");
    expect(onboardingHeadingOf("add", { reason: "legacy" }).title).toBe("Hesabını ekle");
  });

  it("Demirkazık: bakarken düşünüyor, diğer ekranlarda anlatıyor", () => {
    expect(onboardingMascotState("probing")).toBe("thinking");
    expect(onboardingMascotState("building")).toBe("thinking");
    for (const screen of ["add", "review", "rivals", "done", "blocked"] as const) expect(onboardingMascotState(screen)).toBe("telling");
  });
});

const view = (id: string, extra: Partial<DiscoveryCandidateView> = {}): DiscoveryCandidateView => ({
  competitorId: id,
  platform: "instagram",
  handle: `hesap.${id}`,
  source: "related",
  discoveredAt: "2026-10-01T00:00:00.000Z",
  ...extra,
});

describe("benzer hesap satırları", () => {
  it("elle eklenen en üstte, sonra boyu benzeyenler, sonra diğerleri; aynı sıradakiler geliş sırasını korur", () => {
    const options = buildRivalOptions(
      [view("a"), view("b", { similarSize: true, followers: 12000 }), view("c", { similarSize: false }), view("d", { similarSize: true })],
      [
        { id: "b", handle: "hesap.b", source: "related" },
        { id: "m", handle: "elle.eklenen", source: "manual" },
      ],
    );
    expect(options.map((option) => option.id)).toEqual(["m", "b", "d", "a", "c"]);
    expect(options[0]).toMatchObject({ manual: true });
    expect(options[1]).toMatchObject({ manual: false, similarSize: true, followers: 12000 });
  });

  it("ölçülemeyen takipçi / boy alanı yazılmaz (0 ya da false uydurulmaz)", () => {
    const [option] = buildRivalOptions([view("a")], []);
    expect(option).not.toHaveProperty("followers");
    expect(option).not.toHaveProperty("similarSize");
  });

  it("ilk üç satır ön seçilidir", () => {
    const options = buildRivalOptions([view("a"), view("b"), view("c"), view("d")], []);
    expect(preselectedRivalIds(options)).toEqual(["a", "b", "c"]);
    expect(preselectedRivalIds([])).toEqual([]);
  });
});

describe("ekran metinleri", () => {
  /** Müşteri metninde olmaması gerekenler: tutar, sağlayıcı, komut, iç terimler (`plain-language-onboarding.test.ts` ile aynı). */
  const FORBIDDEN = /\$|USD|kredi|apify|supabase|npm |probe|build|onboarding|candidate|tracked/i;

  function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (typeof value === "function") return strings((value as (...args: unknown[]) => unknown)(2, 5));
    if (Array.isArray(value)) return value.flatMap(strings);
    if (typeof value === "object" && value !== null) return Object.values(value).flatMap(strings);
    return [];
  }

  it("hiçbiri panel jargonu, tutar, sağlayıcı adı ya da iç terim taşımaz", () => {
    const texts = strings([
      ONBOARDING_ROUTE_PLAIN,
      ONBOARDING_TURN_PLAIN,
      ONBOARDING_ADD_SCREEN_PLAIN,
      ONBOARDING_PROGRESS_PLAIN,
      ONBOARDING_REVIEW_PLAIN,
      ONBOARDING_RIVALS_PLAIN,
      ONBOARDING_DONE_PLAIN,
      ONBOARDING_BLOCKED_PLAIN,
      ONBOARDING_TODAY_BODY_PLAIN,
    ]);
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) {
      expect(text, text).not.toMatch(PANEL_JARGON);
      expect(text, text).not.toMatch(FORBIDDEN);
    }
  });
});
