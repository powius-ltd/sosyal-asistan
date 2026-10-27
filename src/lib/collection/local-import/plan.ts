/**
 * Yerel içe alma (operatör betiği `import:local`) girdisi: bayrak ayrıştırma + ham Apify satırlarını video kimliğine göre seçme +
 * video dosyasını kimlikle eşleme. Saf okuma; ağ ve DB yok.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ImportArgs {
  items: string;
  videos: string;
  ids: string[];
  dryRun: boolean;
}

export function parseImportArgs(argv: readonly string[]): ImportArgs {
  const out: { items?: string; videos?: string; ids: string[]; dryRun: boolean } = { ids: [], dryRun: false };
  for (const arg of argv) {
    const m = /^--(items|videos|ids)=(.*)$/.exec(arg);
    if (m) {
      if (m[2].trim() === "") throw new Error(`--${m[1]} boş olamaz.`);
      if (m[1] === "ids") out.ids = m[2].split(",").map((s) => s.trim()).filter(Boolean);
      else out[m[1] as "items" | "videos"] = m[2].trim();
    } else if (arg === "--dry-run") out.dryRun = true;
    else throw new Error(`Bilinmeyen bayrak: ${arg}`);
  }
  if (!out.items || !out.videos || out.ids.length === 0) throw new Error("Gerekli: --items=<json> --videos=<klasör> --ids=<a,b,...>");
  return { items: out.items, videos: out.videos, ids: out.ids, dryRun: out.dryRun };
}

export interface ImportRow {
  videoId: string;
  handle: string;
  raw: Record<string, unknown>;
  /** Video dosyasının TAM yolu (yalnız okunur). */
  file: string;
}

function handleOf(raw: Record<string, unknown>): string {
  const author = raw.authorMeta as Record<string, unknown> | undefined;
  return typeof author?.name === "string" ? author.name.toLowerCase() : "";
}

/** Seçilen kimliklerin ham satırı + video dosyası; eksik olan açık hatadır (sessiz atlanmaz). */
export function selectImportRows(args: ImportArgs): ImportRow[] {
  const all = JSON.parse(readFileSync(args.items, "utf8")) as unknown;
  if (!Array.isArray(all)) throw new Error("--items bir JSON dizisi olmalı.");
  const files = readdirSync(args.videos).filter((f) => f.endsWith(".mp4"));
  return args.ids.map((videoId) => {
    const raw = all.find((r): r is Record<string, unknown> => typeof r === "object" && r !== null && String((r as { id?: unknown }).id) === videoId);
    if (!raw) throw new Error(`Ham satır yok: ${videoId}`);
    const handle = handleOf(raw);
    if (!handle) throw new Error(`Satırda yazar yok: ${videoId}`);
    const file = files.find((f) => f.endsWith(`-${videoId}.mp4`));
    if (!file) throw new Error(`Video dosyası yok: ${videoId}`);
    return { videoId, handle, raw, file: path.join(args.videos, file) };
  });
}
