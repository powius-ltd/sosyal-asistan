/**
 * Claude CLI çağrısının argümanları (yalnız liste kurar; süreç başlatmaz). Bayraklar `claude --help` (2.1.284) ile doğrulandı ve
 * gerçek çağrıyla denendi (bayrak → neden):
 *  - `-p --output-format json` : tek seferlik çağrı, tek JSON zarfı.
 *  - `--json-schema <şema>`    : yapılandırılmış çıktı (zarfta `structured_output`). Şema `z.toJSONSchema` ile üretilir; CLI `$schema`
 *                                anahtarını REDDEDER ("no schema with key or ref …2020-12"), bu yüzden draft-07 hedeflenir ve
 *                                `$schema` silinir.
 *  - `--no-session-persistence`: oturum diske yazılmaz.
 *  - `--tools ""`              : yerleşik araçların HEPSİ kapalı (rakip metni veridir; dosya/komut/ağ aracı yok). Zarfta yalnız
 *                                yapılandırılmış çıktı aracı (`StructuredOutput`) görünür.
 *  - `--safe-mode`             : CLAUDE.md, hook, MCP, skill, eklenti, özel komutlar kapalı; kimlik doğrulama ve model seçimi normal
 *                                (`--bare` OAuth/abonelik girişini okumaz: abonelikle çalışmaz, kullanılmaz).
 *  - `--strict-mcp-config` + `--disable-slash-commands` : MCP/skill'e ikinci kilit.
 *  - `--permission-prompts none`: izin gerektirecek her şey otomatik reddedilir.
 *  - `--system-prompt`         : Claude Code'un varsayılan istemi YERİNE görev talimatı.
 * Girdi stdin'den gider (Windows argüman boyu sınırı ≈ 32 K karakter); argümana yalnız şema + sistem istemi girer ve toplam
 * `MAX_ARGV_CHARS`'ı aşarsa çağrı başlamadan reddedilir.
 */
import "server-only";

import { z } from "zod";

import { LlmError } from "@/lib/llm/types";

/** Argümanların toplam uzunluk üst sınırı (karakter). Windows komut satırı 32 767 karakterdir; pay bırakılır. */
export const MAX_ARGV_CHARS = 24_000;

/** Zod şemasını CLI'nin kabul ettiği JSON Schema metnine çevirir (draft-07, `$schema` yok, kök nesne). */
export function toCliJsonSchema(schema: z.ZodType): string {
  let json: Record<string, unknown>;
  try {
    json = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "throw" }) as Record<string, unknown>;
  } catch (error) {
    throw new LlmError("invalid_input", `Şema JSON Schema'ya çevrilemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
  }
  delete json.$schema;
  if (json.type !== "object") throw new LlmError("invalid_input", "Çıktı şemasının kökü nesne olmalı (liste bir nesne içine sarılır).");
  return JSON.stringify(json);
}

export interface ClaudeArgsInput {
  schemaJson: string;
  system?: string;
  model?: string;
}

export function buildClaudeArgs({ schemaJson, system, model }: ClaudeArgsInput): string[] {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    schemaJson,
    "--no-session-persistence",
    "--tools",
    "",
    "--safe-mode",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--permission-prompts",
    "none",
  ];
  if (system !== undefined && system.trim() !== "") args.push("--system-prompt", system);
  if (model !== undefined && model.trim() !== "") args.push("--model", model.trim());

  const total = args.reduce((sum, arg) => sum + arg.length + 3, 0);
  if (total > MAX_ARGV_CHARS) {
    throw new LlmError("invalid_input", `Komut satırı argümanları çok uzun (${total} > ${MAX_ARGV_CHARS} karakter): şema ya da sistem istemi küçültülmeli.`);
  }
  return args;
}
