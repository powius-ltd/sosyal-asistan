import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MAX_USD_CEILING } from "@/lib/collection/parse-args";
import { MAX_CONTENT_LIMIT } from "@/lib/collection/plan";
import { BRIEFING_COMMAND_IDS, BRIEFING_COMMANDS } from "@/lib/domain/briefing";
import { CREDIT_HOLD_MAX } from "@/lib/domain/credits";
import { jobCreditKey } from "@/lib/domain/job-credits";
import {
  ACTIVE_JOB_STATUSES,
  availableApprovalBases,
  canCancelJob,
  isActiveJob,
  isJobApprovalFresh,
  isUsdApprovalBasis,
  JOB_APPROVAL_BASES,
  JOB_APPROVAL_TTL_MS,
  JOB_COLLECT_LIMIT_MAX,
  JOB_ERROR_MAX_CHARS,
  JOB_KICK_AFTER_MS,
  JOB_KIND_BY_COMMAND,
  JOB_KIND_SPEC,
  JOB_KINDS,
  JOB_LOG_TAIL_MAX_CHARS,
  JOB_QUEUE_DEFAULT,
  JOB_QUEUE_PATTERN,
  JOB_SPEND_MAX_USD,
  JOB_STALE_AFTER_MS,
  JOB_STATUSES,
  JOB_USD_APPROVAL_BASES,
  JOB_STEP_IDS,
  JOB_STEPS_BY_KIND,
  jobAllowsApproval,
  jobRequiresApproval,
  jobScript,
  jobStaleness,
  needsWorkerKick,
  suggestApprovalUsd,
} from "@/lib/domain/panel-job";
import { ONBOARDING_PHASE_SPEC, ONBOARDING_PHASES, ONBOARDING_TOTAL_MAX_USD, onboardingPhaseOf, onboardingStepsOf } from "@/lib/domain/onboarding-job";
import { ROUTINE_STEPS } from "@/lib/orchestrator/types";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("tür tablosu", () => {
  it("her tür komut tablosuna birebir bağlı; para bayrağı ve betik adı komut tablosuyla tutarlı", () => {
    expect(Object.keys(JOB_KIND_SPEC).sort()).toEqual([...JOB_KINDS].sort());
    expect(Object.keys(JOB_KIND_BY_COMMAND).sort()).toEqual([...BRIEFING_COMMAND_IDS].sort());
    const withCommand = JOB_KINDS.filter((kind) => JOB_KIND_SPEC[kind].commandId !== undefined);
    expect(JOB_KINDS.filter((kind) => !withCommand.includes(kind)), "komutu olmayanlar: başlangıç işi ve halka uçları (Zernio ölçümü, keşif)").toEqual(["onboarding", "measure_zernio", "discover", "order", "order_return", "publish", "ads_sync", "produce"]);
    expect(jobScript("onboarding"), "betiği yok: yedek komut metni de yok").toBeUndefined();
    expect(new Set(Object.values(JOB_KIND_BY_COMMAND)).size, "komut → tür birebir").toBe(withCommand.length);
    for (const kind of JOB_KINDS) {
      const spec = JOB_KIND_SPEC[kind];
      expect(spec.approvalBases.length > 0, `${kind}: dayanak yalnız harcayabilen türde`).toBe(spec.spend !== "never");
      expect(spec.timeoutMinutes, kind).toBeGreaterThan(0);
      if (spec.commandId === undefined) continue;
      expect(JOB_KIND_BY_COMMAND[spec.commandId], kind).toBe(kind);
      expect(BRIEFING_COMMANDS[spec.commandId].spendsMoney, `${kind}: paralı = onaysız koşmaz`).toBe(spec.spend === "always");
      expect(jobScript(kind), kind).toBe(BRIEFING_COMMANDS[spec.commandId].script);
    }
    expect([jobScript("routine"), jobScript("briefing"), jobScript("collect")]).toEqual(["rutin", "brief:now", "collect:now"]);
  });

  it("kararlar: toplama her seferinde tutar; ölçüm tutar ya da aylık tavan; önizleme yalnız tur / toplama / ölçüm", () => {
    expect(JOB_KIND_SPEC.collect.approvalBases).toEqual(["one_time"]);
    expect(JOB_KIND_SPEC.measure.approvalBases).toEqual(["one_time", "monthly_cap"]);
    expect(JOB_KIND_SPEC.routine).toMatchObject({ spend: "optional", approvalBases: ["one_time"], timeoutMinutes: 60 });
    expect(JOB_KINDS.filter((kind) => JOB_KIND_SPEC[kind].preview)).toEqual(["routine", "collect", "measure"]);
    expect(JOB_KINDS.filter((kind) => JOB_KIND_SPEC[kind].spend === "never")).toEqual(["analyze", "label", "plan", "briefing", "measure_zernio", "order", "order_return", "publish", "ads_sync"]);
    expect(JOB_KIND_SPEC.onboarding, "başlangıç: onaysız yazılamaz, yalnız kendi dayanağı, önizleme yok, 60 dk").toEqual({ spend: "always", approvalBases: ["onboarding"], preview: false, timeoutMinutes: 60 });
    for (const kind of JOB_KINDS.filter((k) => k !== "onboarding")) expect(JOB_KIND_SPEC[kind].approvalBases, `${kind}: başlangıç dayanağı başka türde yok`).not.toContain("onboarding");
  });

  it("KISIT 1–2: onay zorunluluğu ve onay kapsamı", () => {
    expect(JOB_KINDS.filter((kind) => jobRequiresApproval(kind, false))).toEqual(["collect", "measure", "onboarding", "discover", "produce"]);
    expect(JOB_KINDS.filter((kind) => jobAllowsApproval(kind, false))).toEqual(["routine", "collect", "measure", "onboarding", "discover", "produce"]);
    for (const kind of JOB_KINDS) {
      expect(jobRequiresApproval(kind, true), `${kind}: kuru koşu onaysızdır`).toBe(false);
      expect(jobAllowsApproval(kind, true), `${kind}: kuru koşuya onay yazılmaz`).toBe(false);
    }
  });

  it("adımlar: haftalık tur = önkontrol + orkestratörün adımları (aynı sıra); tek adımlı işte tek adım", () => {
    expect(JOB_STEPS_BY_KIND.routine).toEqual(["precheck", ...ROUTINE_STEPS]);
    for (const kind of JOB_KINDS.filter((k) => k !== "routine" && k !== "onboarding" && k !== "produce")) expect(JOB_STEPS_BY_KIND[kind], kind).toEqual([kind]);
    expect(JOB_STEPS_BY_KIND.produce, "üretim: fiş yaz, üret, dönüş").toEqual(["order", "produce", "order_return"]);
    expect(new Set(JOB_STEP_IDS).size, "adım kimlikleri tekrarsız").toBe(JOB_STEP_IDS.length);
    for (const steps of Object.values(JOB_STEPS_BY_KIND)) for (const step of steps) expect(JOB_STEP_IDS).toContain(step);
  });

  it("sınırlar betiklerle aynı: tutar tavanı ve içerik sayısı", () => {
    expect(JOB_SPEND_MAX_USD).toBe(MAX_USD_CEILING);
    expect(JOB_COLLECT_LIMIT_MAX).toBe(MAX_CONTENT_LIMIT);
    expect(JOB_QUEUE_PATTERN.test(JOB_QUEUE_DEFAULT)).toBe(true);
    for (const bad of ["", "Panel", "9q", "a b", "x".repeat(41)]) expect(JOB_QUEUE_PATTERN.test(bad), bad).toBe(false);
  });
});

/** 0016 / 0020 anındaki listeler (sonraki migration'lar genişletir; güncel listeyi 0021 testi domain ile karşılaştırır). */
const KINDS_0016 = ["routine", "collect", "measure", "analyze", "label", "plan", "briefing"];
const SPEND_KINDS_0016 = ["collect", "measure"];
const APPROVAL_KINDS_0016 = ["collect", "measure", "routine"];

describe("migration 0016 ile aynı listeler ve sınırlar (domain ↔ DB elle senkron)", () => {
  const sql = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/0016_panel_jobs.sql", import.meta.url)), "utf8");
  const listOf = (pattern: RegExp) => [...(pattern.exec(sql)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);

  it("tür, durum ve onay dayanağı listeleri", () => {
    expect(listOf(/kind text not null check \(kind in \(([^)]+)\)/)).toEqual(KINDS_0016);
    expect(JOB_KINDS.slice(0, KINDS_0016.length), "yeni tür sona eklenir").toEqual(KINDS_0016);
    expect(listOf(/check \(status in \(([^)]+)\)/)).toEqual([...JOB_STATUSES]);
    expect(listOf(/approval_basis text check \(approval_basis in \(([^)]+)\)/), "0016: ilk iki USD dayanağı").toEqual(JOB_USD_APPROVAL_BASES.slice(0, 2));
    expect(listOf(/where status in \(([^)]+)\);/), "tek etkin iş indeksi etkin durumları kapsar").toEqual([...ACTIVE_JOB_STATUSES]);
    expect(listOf(/panel_jobs_spend_needs_approval check \(dry_run or kind not in \(([^)]+)\)/), "KISIT 1 (0016)").toEqual(SPEND_KINDS_0016);
    expect(listOf(/panel_jobs_dry_run_kind check \(not dry_run or kind in \(([^)]+)\)/).sort(), "kuru koşu = önizlemesi olan türler").toEqual(
      JOB_KINDS.filter((kind) => JOB_KIND_SPEC[kind].preview).sort(),
    );
    expect(listOf(/approval_basis is null or \(not dry_run and kind in \(([^)]+)\)/), "KISIT 2 (0016)").toEqual(APPROVAL_KINDS_0016);
  });

  it("tutar tavanı, metin sınırları ve yetim iş eşiği", () => {
    expect(sql).toContain(`approved_max_usd > 0 and approved_max_usd <= ${JOB_SPEND_MAX_USD})`);
    expect(sql).toContain(`char_length(log_tail) <= ${JOB_LOG_TAIL_MAX_CHARS})`);
    expect(sql).toContain(`char_length(error) <= ${JOB_ERROR_MAX_CHARS})`);
    expect(sql).toContain(`select interval '${JOB_STALE_AFTER_MS / 1000} seconds'`);
    expect(sql).toContain(`queue text not null default '${JOB_QUEUE_DEFAULT}'`);
  });
});

describe("migration 0020 ile aynı listeler (kredi dayanağı; 0016'nın kısıtlarını genişletir)", () => {
  const sql = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/0020_panel_job_credits.sql", import.meta.url)), "utf8");
  const listOf = (pattern: RegExp) => [...(pattern.exec(sql)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);

  it("dayanak listesi, KISIT 1 ve KISIT 2 domain ile aynı; kredi onayı USD onayının yerine geçmez", () => {
    expect(listOf(/panel_jobs_approval_basis_check check \(approval_basis in \(([^)]+)\)/), "0020: USD dayanakları + credits").toEqual(["one_time", "monthly_cap", "credits"]);
    expect(JOB_APPROVAL_BASES.filter((basis) => !isUsdApprovalBasis(basis))).toEqual(["credits"]);
    expect(listOf(/panel_jobs_spend_needs_approval check \(dry_run or kind not in \(([^)]+)\)/), "KISIT 1 (0020)").toEqual(SPEND_KINDS_0016);
    expect(sql, "KISIT 1 kredi dayanağını kabul etmez").toContain("or (approval_basis is not null and approval_basis <> 'credits'))");
    expect(listOf(/approval_basis = 'credits' or kind in \(([^)]+)\)/), "KISIT 2 (0020; kredi onayı her türde)").toEqual(APPROVAL_KINDS_0016);
    expect(sql).toContain(`approved_max_credits > 0 and approved_max_credits <= ${CREDIT_HOLD_MAX})`);
    expect(sql, "ayırma anahtarı domain ile aynı biçim").toContain(`'${jobCreditKey("")}' || v_job.id::text`);
  });

  it("USD dayanakları tür tablosunda; kredi dayanağı tür tablosuna girmez (kapı USD içindir)", () => {
    for (const kind of JOB_KINDS) for (const basis of JOB_KIND_SPEC[kind].approvalBases) expect(isUsdApprovalBasis(basis), `${kind}: ${basis}`).toBe(true);
    expect(isUsdApprovalBasis("credits")).toBe(false);
    expect(isUsdApprovalBasis(undefined)).toBe(false);
  });
});

describe("migration 0021 ile aynı listeler (başlangıç işi; GÜNCEL tür / dayanak / kısıt listeleri domain ile birebir)", () => {
  const sql = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/0021_onboarding.sql", import.meta.url)), "utf8");
  const listOf = (pattern: RegExp) => [...(pattern.exec(sql)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);

  it("tür ve dayanak listeleri; KISIT 1 ve KISIT 2 domain ile aynı (0026: sipariş türü eklenir; kısıtlar 0025 ile aynı)", () => {
    const read = (name: string) => readFileSync(fileURLToPath(new URL(`../../../supabase/migrations/${name}`, import.meta.url)), "utf8");
    const listIn = (text: string, pattern: RegExp) => [...(pattern.exec(text)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const latest = read("0034_produce_job.sql");
    const latestList = (pattern: RegExp) => listIn(latest, pattern);
    expect(listIn(read("0034_produce_job.sql"), /panel_jobs_kind_check check \(kind in \(([^)]+)\)/)).toEqual([...JOB_KINDS]);
    expect(listOf(/panel_jobs_approval_basis_check check \(approval_basis in \(([^)]+)\)/)).toEqual([...JOB_APPROVAL_BASES]);
    expect(latestList(/panel_jobs_spend_needs_approval check \(dry_run or kind not in \(([^)]+)\)/), "KISIT 1 = USD onayı isteyen türler").toEqual(
      JOB_KINDS.filter((kind) => jobRequiresApproval(kind, false)),
    );
    expect(sql, "KISIT 1 kredi dayanağını kabul etmez").toContain("or (approval_basis is not null and approval_basis <> 'credits'))");
    expect(latestList(/approval_basis = 'credits' or kind in \(([^)]+)\)/).sort(), "KISIT 2 = USD harcayabilen türler").toEqual(
      JOB_KINDS.filter((kind) => jobAllowsApproval(kind, false)).sort(),
    );
    expect(sql, "dayanak ↔ tür kilidi").toContain("((approval_basis is not distinct from 'onboarding') = (kind = 'onboarding'))");
  });

  it("aşamalar, sabit tavanlar, kredi tavanları, deneme sınırları ve tek ilk tur kuralı domain ile aynı", () => {
    const { probe, build } = ONBOARDING_PHASE_SPEC;
    expect(listOf(/coalesce\(params ->> 'phase', ''\) in \(([^)]+)\)/)).toEqual([...ONBOARDING_PHASES]);
    expect(sql).toContain(`(case params ->> 'phase' when 'probe' then ${probe.maxUsd.toFixed(2)} else ${build.maxUsd.toFixed(2)} end)::numeric`);
    expect(sql).toContain(`(case params ->> 'phase' when 'probe' then ${probe.maxCredits} else ${build.maxCredits} end)`);
    expect(sql).toContain(`if v_count >= (case v_phase when 'probe' then ${probe.attemptsMax} else ${build.attemptsMax} end) then`);
    expect(probe.maxUsd + build.maxUsd, "toplam tavan = aşamaların toplamı").toBeCloseTo(ONBOARDING_TOTAL_MAX_USD, 10);
    expect(Math.max(probe.maxUsd, build.maxUsd), "aşama tavanı tek seferlik onay tavanını aşmaz").toBeLessThanOrEqual(JOB_SPEND_MAX_USD);
    expect(Math.max(probe.timeoutMinutes, build.timeoutMinutes), "türün süre tavanı aşamaların en büyüğü").toBe(JOB_KIND_SPEC.onboarding.timeoutMinutes);
    expect(sql, "hesap başına tek ilk tur: etkin + tamam + kısmi").toMatch(
      /create unique index panel_jobs_one_onboarding_build[\s\S]*?where kind = 'onboarding' and params ->> 'phase' = 'build' and status in \('queued', 'running', 'succeeded', 'partial'\);/,
    );
    expect(sql, "kullanıcı başına tekil hesap").toContain("raise exception 'own_account_exists' using errcode = '23505'");
  });

  it("adımlar: türün listesi iki aşamanın birleşimi (aynı sıra); aşama adımları bilinen kimlikler", () => {
    const union = JOB_STEPS_BY_KIND.onboarding;
    expect([...new Set([...ONBOARDING_PHASE_SPEC.probe.steps, ...ONBOARDING_PHASE_SPEC.build.steps])]).toEqual([...union]);
    for (const phase of ONBOARDING_PHASES) {
      const steps = onboardingStepsOf(phase);
      expect(steps.map((step) => union.indexOf(step)), `${phase}: birleşimdeki sırayla`).toEqual([...steps.map((step) => union.indexOf(step))].sort((a, b) => a - b));
      for (const step of steps) expect(JOB_STEP_IDS).toContain(step);
    }
    expect(onboardingPhaseOf({ kind: "onboarding", params: { phase: "build" } })).toBe("build");
    expect(onboardingPhaseOf({ kind: "onboarding", params: {} }), "aşamasız satır").toBeUndefined();
    expect(onboardingPhaseOf({ kind: "routine", params: { phase: "probe" } }), "başka türde aşama yok").toBeUndefined();
  });
});

describe("onay", () => {
  it("availableApprovalBases: aylık tavan yalnız onaylı ve açıkken; 0 = kapalı", () => {
    expect(availableApprovalBases("collect", { apifyMonthlyCapUsd: 10 })).toEqual(["one_time"]);
    expect(availableApprovalBases("routine", {})).toEqual(["one_time"]);
    expect(availableApprovalBases("collect", { apifyMonthlyCapUsd: 0 }), "Apify harcaması kapalı").toEqual([]);
    expect(availableApprovalBases("measure", { apifyMonthlyCapUsd: 10 }), "ölçüm tavanı onaysız: tutar girilir").toEqual(["one_time"]);
    expect(availableApprovalBases("measure", { apifyMonthlyCapUsd: 10, measureMonthlyCapUsd: 1 }), "tavan onaylı: tek onay önce").toEqual(["monthly_cap", "one_time"]);
    expect(availableApprovalBases("measure", { apifyMonthlyCapUsd: 10, measureMonthlyCapUsd: 0 }), "ölçüm kapalı").toEqual([]);
    expect(availableApprovalBases("measure", { apifyMonthlyCapUsd: 0, measureMonthlyCapUsd: 1 }), "Apify kapalıysa ölçüm de harcayamaz").toEqual([]);
    for (const kind of ["analyze", "label", "plan", "briefing"] as const) expect(availableApprovalBases(kind, { apifyMonthlyCapUsd: 10, measureMonthlyCapUsd: 1 })).toEqual([]);
    expect(availableApprovalBases("onboarding", { apifyMonthlyCapUsd: 10 }), "başlangıç: yalnız kendi dayanağı").toEqual(["onboarding"]);
    expect(availableApprovalBases("onboarding", { apifyMonthlyCapUsd: 0 }), "harcama kapalıysa başlangıç da başlamaz").toEqual([]);
  });

  it("isJobApprovalFresh: 24 saate kadar geçerli; eski, gelecekteki ya da okunamayan onay harcatmaz", () => {
    expect(isJobApprovalFresh(ago(0), NOW)).toBe(true);
    expect(isJobApprovalFresh(ago(JOB_APPROVAL_TTL_MS), NOW), "tam sınır geçerli").toBe(true);
    expect(isJobApprovalFresh(ago(JOB_APPROVAL_TTL_MS + 1), NOW)).toBe(false);
    expect(isJobApprovalFresh(ago(-60_000), NOW), "gelecekteki onay").toBe(false);
    expect(isJobApprovalFresh("dün", NOW)).toBe(false);
  });

  it("suggestApprovalUsd: tahmin 0,05'e yukarı yuvarlanır; tahmin yoksa ya da tavanı aşıyorsa öneri yok (0 uydurulmaz)", () => {
    expect([0.13, 0.1, 0.101, 0.3, 0.29, 0.001, 1.96, 2].map(suggestApprovalUsd)).toEqual([0.15, 0.1, 0.15, 0.3, 0.3, 0.05, 2, 2]);
    for (const value of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2.01]) expect(suggestApprovalUsd(value), String(value)).toBeUndefined();
  });
});

describe("durum ve zaman kuralları", () => {
  it("etkin = sırada ya da çalışıyor; yalnız etkin iş durdurulabilir", () => {
    expect(JOB_STATUSES.filter((status) => isActiveJob({ status }))).toEqual(["queued", "running"]);
    expect(JOB_STATUSES.filter(canCancelJob)).toEqual(["queued", "running"]);
  });

  it("jobStaleness: yalnız çalışan iş bayat olabilir; sınır 90 sn (tam sınır taze); nabız yoksa bayat", () => {
    expect(jobStaleness({ status: "running", heartbeatAt: ago(10_000) }, NOW)).toEqual({ stale: false });
    expect(jobStaleness({ status: "running", heartbeatAt: ago(JOB_STALE_AFTER_MS) }, NOW)).toEqual({ stale: false });
    expect(jobStaleness({ status: "running", heartbeatAt: ago(JOB_STALE_AFTER_MS + 1) }, NOW)).toEqual({ stale: true, silentMs: JOB_STALE_AFTER_MS + 1 });
    expect(jobStaleness({ status: "running", heartbeatAt: undefined }, NOW)).toEqual({ stale: true });
    expect(jobStaleness({ status: "running", heartbeatAt: "bozuk" }, NOW)).toEqual({ stale: true });
    for (const status of ["queued", "succeeded", "failed", "cancelled"] as const) {
      expect(jobStaleness({ status, heartbeatAt: ago(3_600_000) }, NOW), status).toEqual({ stale: false });
    }
  });

  it("needsWorkerKick: yalnız yeterince beklemiş sıradaki iş", () => {
    expect(needsWorkerKick({ status: "queued", createdAt: ago(JOB_KICK_AFTER_MS - 1) }, NOW)).toBe(false);
    expect(needsWorkerKick({ status: "queued", createdAt: ago(JOB_KICK_AFTER_MS) }, NOW)).toBe(true);
    expect(needsWorkerKick({ status: "running", createdAt: ago(3_600_000) }, NOW)).toBe(false);
    expect(needsWorkerKick({ status: "queued", createdAt: "bozuk" }, NOW)).toBe(false);
  });
});
