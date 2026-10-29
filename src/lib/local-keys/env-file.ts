/**
 * `.env.local` dosyasına anahtar yazar (ATOMİK: aynı klasörde geçici dosya + rename; izin 0600). Dosya yoksa kurulur; silme, dosya yoksa
 * hiçbir şey yapmaz. Değer yalnız dosyaya yazılır; hata iletisine girmez.
 */
import "server-only";

import fs from "node:fs";
import path from "node:path";

import { upsertEnvText } from "@/lib/local-keys/env-text";

export const ENV_FILE_NAME = ".env.local";

export function writeEnvValue(dir: string, name: string, value: string | undefined): void {
  const target = path.join(dir, ENV_FILE_NAME);
  let current = "";
  try {
    current = fs.readFileSync(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Ayar dosyası okunamadı.");
    if (value === undefined) return;
  }
  const next = upsertEnvText(current, name, value);
  if (next === current) return;
  const tmp = path.join(dir, `${ENV_FILE_NAME}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, next, { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, target);
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* geçici dosya zaten yok */
    }
    throw new Error("Ayar dosyası yazılamadı.");
  }
}
