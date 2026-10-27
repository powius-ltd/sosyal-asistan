/**
 * `--workspace=<id|slug|ad>` bayrağı (betikler): TEK ortak çözümleme. Varsayılan `LOCAL_WORKSPACE_ID`. Bilinmeyen/belirsiz değer açık
 * hata + mevcut çalışma alanlarının listesiyle reddedilir (yanlış çalışma alanında sessizce işlem yapılmaz). Bayrak betiğe özel
 * ayrıştırıcıdan ÖNCE `splitWorkspaceArg` ile ayıklanır (ayrıştırıcılar bilinmeyen bayrağı reddeder).
 */
import "server-only";

import { readLocalSupabaseEnv } from "@/lib/data/supabase/from-env";
import { foldTurkish } from "@/lib/text";
import { listSupabaseWorkspaces, type WorkspaceListItem } from "@/lib/workspace/registry-db";

/** Kimlik öneki en az bu kadar karakter olmalı (kısa önekler yanlışlıkla eşleşmesin). */
const MIN_ID_PREFIX = 8;

export interface WorkspaceArgs {
  /** `--workspace=` değeri (yoksa undefined → `LOCAL_WORKSPACE_ID`). */
  workspace?: string;
  /** `--all` (yalnız izin verilen betikte). */
  all: boolean;
  /** Bu bayraklar çıkarılmış kalan argümanlar (betiğin kendi ayrıştırıcısına gider). */
  rest: string[];
}

/** `--workspace=<değer>` (ve izinliyse `--all`) ayıklanır. Boş değer, tekrar ve `--workspace` + `--all` birlikte hata verir. */
export function splitWorkspaceArg(argv: readonly string[], options: { allowAll?: boolean } = {}): WorkspaceArgs {
  const result: WorkspaceArgs = { all: false, rest: [] };
  for (const arg of argv) {
    const match = /^--workspace=(.*)$/.exec(arg);
    if (match) {
      const value = match[1].trim();
      if (value === "") throw new Error("--workspace boş olamaz (--workspace=<id|slug|ad>).");
      if (result.workspace !== undefined) throw new Error("--workspace bir kez verilebilir.");
      result.workspace = value;
    } else if (arg === "--all") {
      if (!options.allowAll) throw new Error("--all bu komutta yok (yalnız rutin: npm run rutin -- --all).");
      result.all = true;
    } else if (arg === "--workspace") {
      throw new Error("--workspace değer ister: --workspace=<id|slug|ad>.");
    } else {
      result.rest.push(arg);
    }
  }
  if (result.all && result.workspace !== undefined) throw new Error("--all ile --workspace birlikte verilemez.");
  return result;
}

/** Hata iletisine eklenen liste: slug (yoksa kimlik önü) · ad · kimlik. */
export function describeWorkspaces(list: readonly WorkspaceListItem[]): string {
  if (list.length === 0) return "  (hiç çalışma alanı yok)";
  return list.map((item) => `  - ${item.slug ?? item.id.slice(0, 8)} · ${item.name} · ${item.id}`).join("\n");
}

/**
 * Saf eşleştirme: tam kimlik → slug → ad (Türkçe katlamalı) → kimlik öneki (≥ 8 karakter). Her kademede tek eşleşme gerekir;
 * birden çok eşleşme (ör. aynı ad) belirsizdir ve reddedilir.
 */
export function matchWorkspaceRef(ref: string, list: readonly WorkspaceListItem[]): WorkspaceListItem {
  const needle = ref.trim();
  const lower = needle.toLowerCase();
  const folded = foldTurkish(needle);
  const stages: Array<(item: WorkspaceListItem) => boolean> = [
    (item) => item.id.toLowerCase() === lower,
    (item) => item.slug !== undefined && item.slug.toLowerCase() === lower,
    (item) => foldTurkish(item.name) === folded,
    (item) => lower.length >= MIN_ID_PREFIX && item.id.toLowerCase().startsWith(lower),
  ];
  for (const stage of stages) {
    const found = list.filter(stage);
    if (found.length === 1) return found[0];
    if (found.length > 1) {
      throw new Error(`"${needle}" birden çok çalışma alanıyla eşleşti; slug ya da kimlik ver:\n${describeWorkspaces(found)}`);
    }
  }
  throw new Error(`Bilinmeyen çalışma alanı: "${needle}". Mevcut çalışma alanları:\n${describeWorkspaces(list)}`);
}

/** Betik çıktısının ilk satırı: hangi çalışma alanında işlem yapıldığı açıkça görünsün. */
export function workspaceBanner(item: { id: string; name: string; slug?: string }): string {
  return `Çalışma alanı: ${item.name} (${item.slug ?? item.id.slice(0, 8)})`;
}

/** Bayrağı çözer; bayrak yoksa `LOCAL_WORKSPACE_ID` (kayıtta yoksa aynı açık hata). */
export async function resolveWorkspaceArg(ref: string | undefined): Promise<WorkspaceListItem> {
  const list = await listSupabaseWorkspaces();
  return matchWorkspaceRef(ref ?? readLocalSupabaseEnv().workspaceId, list);
}

/** `rutin -- --all`: tüm çalışma alanları, kayıt sırasıyla. */
export async function resolveAllWorkspaces(): Promise<WorkspaceListItem[]> {
  const list = await listSupabaseWorkspaces();
  if (list.length === 0) throw new Error("Hiç çalışma alanı yok.");
  return list;
}
