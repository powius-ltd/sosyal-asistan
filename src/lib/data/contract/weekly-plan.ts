/**
 * Sözleşme parçası: haftalık plan + ses profili (Faz 2; salt okuma, temizlik gerekmez).
 * Seed gereksinimi: ≥ 1 haftalık plan (plana giren ≥ 1 fikir, ≥ 2 kanıtlı) ve ≥ 1 kendi hesap için ses profili. Plan YALNIZ sunucu
 * tarafından yazılır (`save_weekly_plan`); depo yazma metodu yoktur.
 */
import { expect, it } from "vitest";

import { IDEA_SOURCES, RIVAL_QUOTE_MAX } from "@/lib/domain/intel";
import { DURATION_BUCKETS } from "@/lib/domain/taxonomy";
import { isVoiceProfileUsable, verifiedTraits } from "@/lib/domain/voice-profile";
import { CONFIDENCE_LEVELS, isWeekStart, weekStartOf, WEEKLY_PLAN_STATUSES } from "@/lib/domain/weekly-plan";
import { expectCode, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";

export function weeklyPlanContract(ctx: ContractContext): void {
  const { wsId, foreign, create } = ctx;

  it("listWeeklyPlans: yeniden eskiye (weekStart azalan), Pazartesi günleri, tek satır/hafta; limit uygulanır; bilinmeyen workspace boş", async () => {
    const r = create();
    const plans = await r.listWeeklyPlans(wsId);
    expect(plans.length, "seed: en az bir plan").toBeGreaterThan(0);
    expect(new Set(plans.map((p) => p.weekStart)).size, "hafta başına tek plan").toBe(plans.length);
    expect(plans.map((p) => p.weekStart), "weekStart azalan").toEqual([...plans.map((p) => p.weekStart)].sort().reverse());
    for (const p of plans) {
      expect(isWeekStart(p.weekStart), `${p.weekStart} Pazartesi`).toBe(true);
      expect(WEEKLY_PLAN_STATUSES).toContain(p.status);
      if (p.confidence !== undefined) expect(CONFIDENCE_LEVELS).toContain(p.confidence);
      expect(p.plannedCount + p.alternativeCount, p.weekStart).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(Date.parse(p.generatedAt))).toBe(false);
    }
    expect((await r.listWeeklyPlans(wsId, { limit: 1 })).length).toBe(1);
    expect((await r.listWeeklyPlans(wsId, { limit: 10_000 })).length).toBeLessThanOrEqual(200);
    expect(await r.listWeeklyPlans(foreign)).toEqual([]);
  });

  it("getWeeklyPlan: özetle tutarlı; plana giren fikirler sıralı ve kanıtlı, adaylar sırasız; fikir deposuyla aynı kayıt", async () => {
    const r = create();
    for (const summary of await r.listWeeklyPlans(wsId)) {
      const plan = await r.getWeeklyPlan(wsId, summary.weekStart);
      if (!plan) throw new Error(`plan okunamadı: ${summary.weekStart}`);
      expect([plan.id, plan.weekStart, plan.status, plan.confidence, plan.summary]).toEqual([summary.id, summary.weekStart, summary.status, summary.confidence, summary.summary]);
      expect([plan.items.length, plan.alternatives.length], plan.weekStart).toEqual([summary.plannedCount, summary.alternativeCount]);
      expect(Object.keys(plan.sections).sort(), "beş bölüm").toEqual(["avoid", "focus", "review", "schedule", "winners"]);
      expect(["awaiting_publish_data", "available"]).toContain(plan.sections.review.status);

      const positions = plan.items.map((i) => i.position);
      expect(positions.every((p) => p !== undefined && Number.isInteger(p) && p >= 1), `${plan.weekStart}: plana girenlerin sırası`).toBe(true);
      expect(positions, "sıra artan ve tekrarsız").toEqual([...new Set(positions)].sort((a, b) => (a as number) - (b as number)));
      expect(plan.alternatives.every((i) => i.position === undefined), "adaylar sırasız").toBe(true);
      const ideaIds = [...plan.items, ...plan.alternatives].map((i) => i.ideaId);
      expect(new Set(ideaIds).size, "bir fikir planda bir kez").toBe(ideaIds.length);

      for (const item of [...plan.items, ...plan.alternatives]) {
        expect(item.idea.id).toBe(item.ideaId);
        const stored = await r.getIdea(wsId, item.ideaId);
        expect(stored, `${item.ideaId}: fikir deposunda`).not.toBeNull();
        expect(IDEA_SOURCES).toContain(item.idea.source);
        expect(item.idea.weeklyPlan, `${item.ideaId}: plan bağı`).toMatchObject({ planId: plan.id, weekStart: plan.weekStart, position: item.position });
        expect(item.idea.details, "details bir nesnedir ({} olabilir)").toBeTypeOf("object");
        if (item.idea.details.durationBucket !== undefined) expect(DURATION_BUCKETS).toContain(item.idea.details.durationBucket);
        for (const quote of item.idea.details.quotes ?? []) expect(Array.from(quote.text).length, "kalıcı kısa alıntı").toBeLessThanOrEqual(RIVAL_QUOTE_MAX);
        if (item.slotAt !== undefined) expect(Number.isNaN(Date.parse(item.slotAt))).toBe(false);
      }
      for (const item of plan.items) {
        expect(new Set(item.idea.evidence.map((e) => e.contentItemId)).size, `${item.ideaId}: ≥ 2 farklı kanıt`).toBeGreaterThanOrEqual(2);
      }
      for (const slot of plan.sections.schedule.slots) {
        expect(slot.weekday >= 0 && slot.weekday <= 6 && slot.hour >= 0 && slot.hour <= 23, "slot gün/saat aralığı").toBe(true);
        expect(Number.isNaN(Date.parse(slot.at))).toBe(false);
      }
    }
  });

  it("getWeeklyPlan: haftanın herhangi bir günü o haftaya hizalanır; plansız hafta null; geçersiz gün invalid_input; bilinmeyen workspace null", async () => {
    const r = create();
    const [latest] = await r.listWeeklyPlans(wsId);
    const midWeek = new Date(Date.parse(`${latest.weekStart}T00:00:00.000Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
    expect(weekStartOf(midWeek)).toBe(latest.weekStart);
    expect((await r.getWeeklyPlan(wsId, midWeek))?.id, "Çarşamba → aynı hafta").toBe(latest.id);
    expect(await r.getWeeklyPlan(wsId, "2000-01-03"), "plansız hafta: null (hata değil)").toBeNull();
    expect(await r.getWeeklyPlan(foreign, latest.weekStart)).toBeNull();
    for (const bad of ["2026-02-31", "bugün", ""]) await expectCode(r.getWeeklyPlan(wsId, bad), "invalid_input");
  });

  it("getVoiceProfile: hesap başına tek güncel profil; özellikler tekil anahtarlı; profili olmayan/bilinmeyen hesap ve workspace null", async () => {
    const r = create();
    const accounts = await r.listOwnAccounts(wsId);
    const profiles = (await Promise.all(accounts.map(async (a) => ({ a, p: await r.getVoiceProfile(wsId, a.id) })))).filter((x) => x.p !== null);
    expect(profiles.length, "seed: en az bir ses profili").toBeGreaterThan(0);
    for (const { a, p } of profiles) {
      if (!p) continue;
      expect([p.accountId, p.platform, p.workspaceId], a.handle).toEqual([a.id, a.platform, wsId]);
      expect(new Set(p.traits.map((t) => t.key)).size, "özellik anahtarları tekil").toBe(p.traits.length);
      expect(verifiedTraits(p).length).toBeLessThanOrEqual(p.traits.length);
      expect(isVoiceProfileUsable(p), "seed profili ≥ 5 doğrulanmış özellik taşır").toBe(verifiedTraits(p).length >= 5);
      for (const t of p.traits) expect(t.examples.every((e) => e.quote.trim() !== "" && e.contentItemId !== ""), t.key).toBe(true);
      expect(p.stats.sampleSize).toBeGreaterThanOrEqual(0);
      expect(p.lexicon.signaturePhrases).toBeInstanceOf(Array);
      expect(p.lexicon.avoidPhrases).toBeInstanceOf(Array);
      expect(p.sampleSize).toBeGreaterThanOrEqual(0);
      expect(p.taxonomyVersion.trim()).not.toBe("");
    }
    expect(await r.getVoiceProfile(wsId, MISSING_ID)).toBeNull();
    expect(await r.getVoiceProfile(foreign, profiles[0].a.id)).toBeNull();
  });
}
