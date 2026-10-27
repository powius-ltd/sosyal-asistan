import { describe, expect, it } from "vitest";

import { toRepositoryError } from "@/lib/data/supabase/errors";
import { ONBOARDING_ERROR } from "@/lib/data/views/onboarding";
import { ONBOARDING_ACTIONS, ONBOARDING_REASONS, ONBOARDING_STEPS } from "@/lib/domain/onboarding";
import { ONBOARDING_PHASES } from "@/lib/domain/onboarding-job";
import { JOB_KIND_PLAIN, JOB_OUTCOME_PLAIN, JOB_STEP_PLAIN, OUTLIER_PLAIN, PANEL_JARGON } from "@/lib/plain-language";
import {
  ONBOARDING_ACTION_PLAIN,
  ONBOARDING_ADD_PLAIN,
  ONBOARDING_PHASE_PLAIN,
  ONBOARDING_REASON_PLAIN,
  ONBOARDING_START_NOTE_PLAIN,
  ONBOARDING_STEP_PLAIN,
  ONBOARDING_TERMS,
  ONBOARDING_TODAY_PLAIN,
  onboardingProfilePhrase,
  onboardingRivalsPhrase,
} from "@/lib/plain-language-onboarding";

/** Müşteri metninde olmaması gerekenler: tutar, sağlayıcı, komut, iç terimler. */
const FORBIDDEN = /\$|USD|kredi|apify|supabase|npm |probe|build|onboarding|candidate|tracked/i;

describe("başlangıç akışı düz dil sözlüğü", () => {
  it("her adım, neden, eylem ve aşamanın metni var", () => {
    expect(Object.keys(ONBOARDING_STEP_PLAIN).sort()).toEqual([...ONBOARDING_STEPS].sort());
    expect(Object.keys(ONBOARDING_REASON_PLAIN).sort()).toEqual([...ONBOARDING_REASONS].sort());
    expect(Object.keys(ONBOARDING_ACTION_PLAIN).sort()).toEqual([...ONBOARDING_ACTIONS].sort());
    expect(Object.keys(ONBOARDING_PHASE_PLAIN).sort()).toEqual([...ONBOARDING_PHASES].sort());
  });

  it("hiçbir metin panel jargonu, tutar, sağlayıcı adı ya da iç terim taşımaz", () => {
    const texts = [
      ...Object.values(ONBOARDING_TERMS),
      ...Object.values(ONBOARDING_STEP_PLAIN).flatMap(({ title, lead }) => [title, lead]),
      ...Object.values(ONBOARDING_REASON_PLAIN),
      ...Object.values(ONBOARDING_ACTION_PLAIN),
      ...Object.values(ONBOARDING_PHASE_PLAIN),
      ...Object.values(ONBOARDING_ADD_PLAIN),
      ...Object.values(ONBOARDING_TODAY_PLAIN),
      ...Object.values(ONBOARDING_ERROR),
      ONBOARDING_START_NOTE_PLAIN,
      JOB_KIND_PLAIN.onboarding.label,
      JOB_KIND_PLAIN.onboarding.doing,
      ...(["verify", "discover", "draft_niche"] as const).flatMap((step) => [JOB_STEP_PLAIN[step].name, JOB_STEP_PLAIN[step].doing]),
      ...(["account_private", "account_not_found", "no_videos", "few_videos", "plan_not_ready", "not_implemented"] as const).map((code) => JOB_OUTCOME_PLAIN[code]),
    ];
    for (const text of texts) {
      expect(text, text).not.toMatch(PANEL_JARGON);
      expect(text, text).not.toMatch(FORBIDDEN);
    }
    expect(ONBOARDING_TERMS.outlier, "ana sözlükle aynı karşılık").toBe(OUTLIER_PLAIN.name);
  });

  it("cümle kurucular: bilinmeyen sayı yazılmaz (0 uydurulmaz)", () => {
    expect(onboardingProfilePhrase({ handle: "ornek.hesap", followers: 12400, videoCount: 25 })).toBe("@ornek.hesap · 12,4 B takipçi · 25 video");
    expect(onboardingProfilePhrase({ handle: "ornek.hesap" })).toBe("@ornek.hesap");
    expect(onboardingProfilePhrase({ handle: "ornek.hesap", followers: 0 })).toBe("@ornek.hesap · 0 takipçi");
    expect(onboardingRivalsPhrase(0)).toBe("Benzer hesap seçmedin");
    expect(onboardingRivalsPhrase(3)).toBe("3 benzer hesap seçtin");
  });
});

describe("DB hatası → depo hatası (migration 0021)", () => {
  const pg = (code: string, message: string) => ({ code, message, details: "", hint: "", name: "PostgrestError" }) as Parameters<typeof toRepositoryError>[0];

  it("tek ilk tur, tekil hesap, deneme sınırı ve bakış şartı Türkçe mesajla çevrilir", () => {
    expect(toRepositoryError(pg("23505", "duplicate key value violates unique constraint \"panel_jobs_one_onboarding_build\""))).toMatchObject({ code: "already_exists", message: ONBOARDING_ERROR.buildExists });
    expect(toRepositoryError(pg("23505", "own_account_exists"))).toMatchObject({ code: "already_exists", message: ONBOARDING_ERROR.accountExists });
    expect(toRepositoryError(pg("23514", "panel_job_onboarding_limit"))).toMatchObject({ code: "invalid_state", message: ONBOARDING_ERROR.limit });
    expect(toRepositoryError(pg("23514", "panel_job_onboarding_needs_probe"))).toMatchObject({ code: "invalid_state", message: ONBOARDING_ERROR.needsProbe });
    // Başlangıç işinin şekil kısıtı (sabit tavan dışı tutar vb.) girdi hatasıdır.
    expect(toRepositoryError(pg("23514", "new row for relation \"panel_jobs\" violates check constraint \"panel_jobs_onboarding_shape\""))).toMatchObject({ code: "invalid_input" });
    // Etkin iş iletisi değişmedi.
    expect(toRepositoryError(pg("23505", "panel_job_active"))).toMatchObject({ code: "already_exists" });
  });
});
