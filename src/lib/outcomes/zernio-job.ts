/**
 * Zernio ölçümünün tek giriş noktası: betik (`scripts/measure-zernio.mts`) ve panel işçisi (`measure_zernio` işi) AYNI işlevi çağırır.
 * Anahtar seçimi, istemci ve depo kurulumu burada; anahtar yoksa hiçbir çağrı yapılmaz (`key_missing`). Salt okunur, ücretsiz.
 */
import "server-only";

import { measureZernio, type ZernioMeasureResult } from "@/lib/outcomes/measure-zernio";
import { createSupabaseZernioStore } from "@/lib/outcomes/measure-zernio-store";
import type { AdminClient } from "@/lib/supabase/admin";
import { pickZernioKey } from "@/lib/zernio/api-key";
import { createZernioClient } from "@/lib/zernio/client";

export interface ZernioJobOptions {
  client: AdminClient;
  workspaceId: string;
  workspaceSlug?: string;
  now: Date;
  dryRun: boolean;
  env: Readonly<Record<string, string | undefined>>;
  log?: (line: string) => void;
}

export type ZernioJobResult = { outcome: "key_missing" } | { outcome: "measured"; keyEnvName: string; result: ZernioMeasureResult };

export async function runZernioMeasure(options: ZernioJobOptions): Promise<ZernioJobResult> {
  const key = pickZernioKey(options.workspaceSlug, options.env);
  if (key === undefined) return { outcome: "key_missing" };
  const result = await measureZernio(
    { workspaceId: options.workspaceId, now: options.now, dryRun: options.dryRun, ...(options.log === undefined ? {} : { log: options.log }) },
    { zernio: createZernioClient({ apiKey: key.apiKey }), store: createSupabaseZernioStore(options.client) },
  );
  return { outcome: "measured", keyEnvName: key.envName, result };
}
