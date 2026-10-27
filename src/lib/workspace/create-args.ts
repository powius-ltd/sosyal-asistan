/**
 * `npm run workspace -- create …` ve `set …` bayrakları (saf): ham metinleri `createWorkspaceSchema` / `workspaceSettingsSchema` girdisine çevirir;
 * doğrulama şemalardadır. Bilinmeyen bayrak hata verir (yazım hatası sessizce yutulmaz).
 */
import type { CreateWorkspaceInput, WorkspaceSettingsInput } from "@/lib/workspace/create-input";

export const WORKSPACE_USAGE = [
  "Kullanım:",
  "  npm run workspace -- list",
  "  npm run workspace -- create --name=<ad> --handle=<kullanıcı adı> [--type=business|creator|mixed] [--niche=<niş özeti>] [--tz=<saat dilimi>] [--audience-tz=<hedef kitle saat dilimi>] [--region=TR|US|TR_US] [--lang=tr|en] [--platform=instagram]",
  "  npm run workspace -- set --workspace=<id|slug|ad> [--type=business|creator|mixed] [--lang=tr|en] [--agent-cap=<usd>] [--collect-every=<gün>] [--videos=<sayı>] [--rivals=<sayı>]   (hesap türü, içerik dili, yönetici ajan ayarları; --agent-cap vermek tavanı ONAYLAMAKTIR)",
].join("\n");

/** `create` bayrak adı → şema alanı. */
const CREATE_FLAGS: Record<string, keyof CreateWorkspaceInput> = {
  name: "name",
  handle: "handle",
  type: "accountType",
  niche: "nicheBrief",
  tz: "timezone",
  "audience-tz": "audienceTimezone",
  region: "complianceRegion",
  lang: "contentLanguage",
  platform: "platform",
};

/** `set` bayrak adı → şema alanı (`--workspace` ayrıca ayıklanır: `resolve-arg.ts` `splitWorkspaceArg`). */
const SET_FLAGS: Record<string, keyof WorkspaceSettingsInput> = {
  type: "accountType",
  lang: "contentLanguage",
  "agent-cap": "agentMonthlyCapUsd",
  "collect-every": "collectEveryDays",
  videos: "collectVideoLimit",
  rivals: "rivalTarget",
};

function parseFlags(argv: readonly string[], flags: Readonly<Record<string, string>>): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)=([\s\S]*)$/.exec(arg);
    const field = match ? flags[match[1]] : undefined;
    if (!match || field === undefined) throw new Error(`Bilinmeyen bayrak: ${arg}\n${WORKSPACE_USAGE}`);
    if (field in raw) throw new Error(`--${match[1]} bir kez verilebilir.`);
    raw[field] = match[2];
  }
  return raw;
}

/** Ham (doğrulanmamış) oluşturma girdisi; `createWorkspaceSchema` ile doğrulanır. */
export function parseCreateArgs(argv: readonly string[]): Record<string, string> {
  return parseFlags(argv, CREATE_FLAGS);
}

/** Ham (doğrulanmamış) `set` girdisi (`--type`, `--lang`, ajan bayrakları); `workspaceSettingsSchema` ile doğrulanır. */
export function parseSetArgs(argv: readonly string[]): Record<string, string> {
  return parseFlags(argv, SET_FLAGS);
}
