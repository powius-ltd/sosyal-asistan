/**
 * Ajan brifingi (`agent_briefings`) yazımı (service role; satır açıkça `workspace_id` ile). Her koşu YENİ satır yazar (geçmiş kalır; ekran
 * en yenisini okur). Satır DB'ye gitmeden önce `briefingRowSchema` ile doğrulanır (yazan ve okuyan aynı şema: ≥ 1 kanıt, `next_step`
 * eylemi, tutarlı eylem, sınırlı metin, 1–5 madde). Şemaya uymayan brifing YAZILMAZ (hata fırlatır).
 */
import "server-only";

import { briefingRowSchema } from "@/lib/data/briefing-schema";
import { ANALYST_AGENT, BRIEFING_SCHEMA_VERSION, type BriefingBasis, type BriefingItem } from "@/lib/domain/briefing";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type BriefingRow = Database["public"]["Tables"]["agent_briefings"]["Insert"];

export interface BriefingRowInput {
  workspaceId: string;
  items: readonly BriefingItem[];
  basis: BriefingBasis;
  promptVersion: string;
  personaVersion: string;
  /** Modelin bildirdiği ad; bilinmiyorsa undefined (NULL yazılır). */
  model?: string;
  /** Üreten abonelik koşusu (`collection_runs.id`). */
  runId?: string;
  now: Date;
}

/** Brifingi doğrulanmış DB satırına çevirir (saf). Şemaya uymayan içerik ZodError fırlatır. */
export function toBriefingRow(input: BriefingRowInput): BriefingRow {
  return briefingRowSchema.parse({
    workspace_id: input.workspaceId,
    agent: ANALYST_AGENT,
    generated_at: input.now.toISOString(),
    payload: { schemaVersion: BRIEFING_SCHEMA_VERSION, items: input.items },
    basis: input.basis,
    prompt_version: input.promptVersion,
    persona_version: input.personaVersion,
    model: input.model ?? null,
    run_id: input.runId ?? null,
  });
}

/** Satırı ekler ve yeni brifingin kimliğini döndürür. */
export async function saveBriefing(client: AdminClient, row: BriefingRow): Promise<string> {
  const { data, error } = await client.from("agent_briefings").insert(row).select("id").single();
  if (error) throw new Error(`Brifing yazılamadı: ${error.message}`);
  return data.id;
}
