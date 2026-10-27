import { describe, expect, it, vi } from "vitest";

import type { ContentItem } from "@/lib/domain/content";
import type { VoiceProfile } from "@/lib/domain/voice-profile";
import type { IntelContext } from "@/lib/intel/context";
import type { PlanSources } from "@/lib/intel/plan-corpus";
import { ensureVoiceProfile } from "@/lib/intel/voice-step";
import { LlmError, type LlmBackend } from "@/lib/llm/types";

const { recordFailed } = vi.hoisted(() => ({ recordFailed: vi.fn(async () => undefined) }));
vi.mock("@/lib/intel/run-log", () => ({ recordFailedLlmRun: recordFailed, recordLlmRun: vi.fn() }));
vi.mock("@/lib/llm/voice-profile", () => ({
  buildVoiceProfile: vi.fn(async () => {
    throw new LlmError("timeout", "Claude CLI zaman aşımı (180 sn).");
  }),
}));

const NOW = new Date("2026-09-30T12:00:00.000Z");
const trait = (key: string) => ({ key, label: key, description: key, verified: true, evidence: [] });
/** Kullanılabilir (5 doğrulanmış özellik) ama bayat (30 gün önce üretilmiş) profil. */
const STALE_USABLE = { traits: ["a", "b", "c", "d", "e"].map(trait), generatedAt: "2026-08-31T12:00:00.000Z" } as unknown as VoiceProfile;
const UNUSABLE = { traits: [trait("a")], generatedAt: "2026-08-31T12:00:00.000Z" } as unknown as VoiceProfile;

const run = (existing: VoiceProfile | null) =>
  ensureVoiceProfile(
    { client: {}, workspaceId: "ws1", now: NOW, repo: { getVoiceProfile: async () => existing } } as unknown as IntelContext,
    {} as LlmBackend,
    {
      accountId: "acc1",
      handle: "ben",
      language: "tr",
      ownItems: [{ id: "c1", caption: "kendi açıklamam", owner: { kind: "own" } } as unknown as ContentItem],
      src: { transcripts: new Map() } as unknown as PlanSources,
      log: () => undefined,
    },
  );

describe("ses profili üretimi LLM hatasıyla düşerse", () => {
  it("kullanılabilir eski profile düşer, hata koşu kaydına yazılır ve nota düşülür (plan çökmez)", async () => {
    const result = await run(STALE_USABLE);
    expect(result).toMatchObject({ profile: STALE_USABLE, built: false });
    expect(result.notes[0]).toContain("zaman aşımı");
    expect(result.notes[0]).toContain("önceki profil (2026-08-31) kullanıldı");
    expect(recordFailed).toHaveBeenCalledTimes(1);
  });

  it("eski profil yoksa/yetersizse de fırlatmaz: profil olduğu gibi döner, not 'önceki profil yok' der (plan-run 'kullanılamıyor' diye durur)", async () => {
    const none = await run(null);
    expect(none.profile).toBeNull();
    expect(none.notes[0]).toContain("kullanılabilir önceki profil yok");
    const weak = await run(UNUSABLE);
    expect(weak.profile).toBe(UNUSABLE);
  });
});
