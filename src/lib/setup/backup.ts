/**
 * Haftalık veritabanı yedeği (saf kararlar): dosya adı, "yedek zamanı geldi mi", eski yedekleri ayıklama. Yazma / silme betikte.
 */
export const BACKUP_KEEP = 4;
export const BACKUP_INTERVAL_DAYS = 7;
const DAY_MS = 86_400_000;
const NAME = /^yedek-(\d{4}-\d{2}-\d{2})\.dump$/;

export function backupFileName(now: Date): string {
  return `yedek-${now.toISOString().slice(0, 10)}.dump`;
}

function backupsOf(files: readonly string[]): { name: string; date: string }[] {
  return files.flatMap((name) => {
    const match = NAME.exec(name);
    return match ? [{ name, date: match[1] }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** En yeni yedek 7 günden eskiyse (ya da hiç yoksa) yedek alınır. Aynı gün ikinci yedek alınmaz. */
export function isBackupDue(files: readonly string[], now: Date): boolean {
  const newest = backupsOf(files).at(-1);
  if (newest === undefined) return true;
  return now.getTime() - Date.parse(`${newest.date}T00:00:00Z`) >= BACKUP_INTERVAL_DAYS * DAY_MS;
}

/** Son `keep` yedek kalır; fazlası (en eskiler) döner. Desene uymayan dosyaya dokunulmaz. */
export function backupsToDelete(files: readonly string[], keep: number = BACKUP_KEEP): string[] {
  const all = backupsOf(files);
  return all.slice(0, Math.max(0, all.length - keep)).map((entry) => entry.name);
}
