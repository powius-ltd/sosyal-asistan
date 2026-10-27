import "server-only";

import type { IntegrationStatus } from "@/lib/domain/connection";

/**
 * Entegrasyon anahtarlarının (env) var/yok durumu. DEĞER asla okunup döndürülmez —
 * yalnız `process.env[name]`'in dolu olup olmadığı. Hem mock hem Supabase deposu kullanır.
 *
 * `optional`: yerel CLI araçları (agy, Claude CLI) için env değişkenleri isteğe bağlıdır (yoksa PATH/varsayılan kullanılır);
 * `configured` = en az biri tanımlı. Araçların KURULU olup olmadığı burada denetlenmez (çalışma anında: `agy --version`).
 */
const INTEGRATIONS: { key: IntegrationStatus["key"]; label: string; env: string[]; note?: string; optional?: boolean }[] = [
  {
    key: "supabase",
    label: "Supabase",
    env: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    note: "Veritabanı, oturum ve dosya deposu.",
  },
  { key: "apify", label: "Apify", env: ["APIFY_TOKEN"], note: "Rakip ve pazar verisi (herkese açık, oturumsuz)." },
  { key: "anthropic", label: "Claude (Anthropic)", env: ["ANTHROPIC_API_KEY"], note: "Hook analizi ve fikir üretimi." },
  {
    key: "gemini_agy",
    label: "Gemini (agy, lokal)",
    env: ["VIDEO_ANALYSIS_BACKEND", "AGY_BIN", "AGY_MODEL", "AGY_MAX_CALLS_PER_RUN", "AGY_TIMEOUT_MS", "FFMPEG_BIN"],
    optional: true,
    note: "Video analizi (abonelik; tutar yok, yalnız çağrı sayısı). Kurulu olup olmadığı çalışma anında denetlenir; yol verilmezse PATH kullanılır.",
  },
  {
    key: "claude_cli",
    label: "Claude CLI (lokal)",
    env: ["LLM_BACKEND", "LLM_MODEL_LIGHT", "CLAUDE_CLI_PATH"],
    optional: true,
    note: "Konu eleği, ses profili, haftalık plan ve fikir/script üretimi (abonelik). Kurulu olup olmadığı çalışma anında denetlenir; yol verilmezse PATH kullanılır.",
  },
  { key: "meta", label: "Meta (Instagram Login)", env: ["META_APP_ID", "META_APP_SECRET"], note: "Kendi hesap analitiği ve yayın." },
  { key: "cron", label: "Zamanlanmış işler", env: ["CRON_SECRET"], note: "Toplama ve yenileme uçlarının kimlik doğrulaması." },
];

export function getIntegrationStatuses(): IntegrationStatus[] {
  return INTEGRATIONS.map(({ key, label, env, note, optional }) => {
    const envVars = env.map((name) => ({ name, present: Boolean(process.env[name]?.trim()) }));
    const configured = optional ? envVars.some((v) => v.present) : envVars.every((v) => v.present);
    return { key, label, configured, ...(optional ? { optional: true } : {}), envVars, note };
  });
}
