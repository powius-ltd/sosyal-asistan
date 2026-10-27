/**
 * `label:angles [--limit=N] [--dry-run]` argümanları. Bilinmeyen argüman hata verir (yanlış yazılmış `--dry-run` sessizce gerçek
 * koşuya dönmesin: gerçek koşu abonelik çağrısı harcar ve DB'ye yazar).
 */
export interface LabelArgs {
  /** Bu koşuda en çok kaç içerik etiketlensin (verilmezse seçilenlerin hepsi). */
  limit?: number;
  dryRun: boolean;
}

export const MAX_LABEL_LIMIT = 500;

export function parseLabelArgs(argv: readonly string[]): LabelArgs {
  const args: LabelArgs = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--limit=")) {
      const raw = arg.slice("--limit=".length).trim();
      const value = raw === "" ? Number.NaN : Number(raw);
      if (!Number.isInteger(value) || value < 1 || value > MAX_LABEL_LIMIT) throw new Error(`--limit 1–${MAX_LABEL_LIMIT} arasında tam sayı olmalı.`);
      args.limit = value;
    } else throw new Error(`Bilinmeyen argüman: ${arg} (geçerli: --limit=N, --dry-run).`);
  }
  return args;
}
