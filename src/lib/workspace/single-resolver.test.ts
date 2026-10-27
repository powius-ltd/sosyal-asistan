/**
 * Çalışma alanı kimliği TEK yerden çözülür: `LOCAL_WORKSPACE_ID` değerini yalnız `readLocalSupabaseEnv` (`lib/data/supabase/from-env.ts`)
 * okur; panel `getPanelContext`, betikler `resolveWorkspaceArg` üzerinden gider. Başka bir yer doğrudan okursa `--workspace` bayrağı
 * ve çerez atlanır (yanlış çalışma alanında işlem). Betiklerin `REQUIRED_ENV` listesi yalnız VAR/YOK denetler, değer okumaz.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..", "..");
const ALLOWED = new Set([join("src", "lib", "data", "supabase", "from-env.ts")]);
const DIRECT_READ = /\benv\.LOCAL_WORKSPACE_ID\b|\benv\[\s*["']LOCAL_WORKSPACE_ID["']\s*\]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts|mjs)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe("LOCAL_WORKSPACE_ID tek çözümleyici", () => {
  it("src ve scripts içinde değeri doğrudan okuyan yer yok (yalnız from-env.ts)", () => {
    const offenders = [...sourceFiles(join(ROOT, "src")), ...sourceFiles(join(ROOT, "scripts"))]
      .map((path) => relative(ROOT, path))
      .filter((path) => !ALLOWED.has(path))
      .filter((path) => DIRECT_READ.test(readFileSync(join(ROOT, path), "utf8")));
    expect(offenders).toEqual([]);
  });
});
