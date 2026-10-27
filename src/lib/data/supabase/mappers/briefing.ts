/**
 * Brifing satırı (`agent_briefings`) → `Briefing`. `payload`/`basis` jsonb'si yazanla AYNI zod şemalarıyla doğrulanır
 * (`lib/data/briefing-schema.ts`): biçimi bozuk satır `undefined` döner (çağıran bir öncekine bakar); kısmen geçerli brifing
 * GÖSTERİLMEZ (eksik madde yanıltıcı olur). Bilinmeyen rol de geçersizdir. NULL → undefined (model, koşu).
 */
import { briefingBasisSchema, briefingPayloadSchema } from "@/lib/data/briefing-schema";
import { opt, iso } from "@/lib/data/supabase/mappers/common";
import { BRIEFING_AGENTS, type Briefing } from "@/lib/domain/briefing";
import type { Tables } from "@/lib/supabase/database.types";

export const BRIEFING_COLUMNS = "id, workspace_id, agent, generated_at, payload, basis, prompt_version, persona_version, model, run_id" as const;

export type BriefingRow = Pick<
  Tables<"agent_briefings">,
  "id" | "workspace_id" | "agent" | "generated_at" | "payload" | "basis" | "prompt_version" | "persona_version" | "model" | "run_id"
>;

export function toBriefing(row: BriefingRow): Briefing | undefined {
  const agent = BRIEFING_AGENTS.find((a) => a === row.agent);
  const payload = briefingPayloadSchema.safeParse(row.payload);
  const basis = briefingBasisSchema.safeParse(row.basis);
  if (agent === undefined || !payload.success || !basis.success) return undefined;
  return {
    id: row.id,
    agent,
    generatedAt: iso(row.generated_at),
    items: payload.data.items,
    basis: basis.data,
    promptVersion: row.prompt_version,
    personaVersion: row.persona_version,
    model: opt(row.model),
    runId: opt(row.run_id),
  };
}
