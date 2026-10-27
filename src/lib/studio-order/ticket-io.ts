/**
 * Sipariş fişi dosya erişimi (TEK yer; `publish` geri yazımı ile üretim saati yazımı ortak kullanır):
 * - `findTicketPath`: `<kök>/<stüdyo hesabı>/<hafta>/<siparis_id>.md`; yol `realpath` ile ÇÖZÜLÜR ve hesap klasörünün içinde kalmıyorsa
 *   (hafta klasörü ya da fiş kök dışına sembolik bağ) bulunamamış sayılır (`order-media.ts` ile aynı denetim).
 * - `replaceTicketFile`: yazmadan önce fiş yeniden okunur, ilk okunanla farklıysa YAZILMAZ; yazım geçici dosya + `rename` (yarım dosya kalmaz).
 */
import { existsSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export interface TicketIo {
  read(path: string): string;
  write(path: string, text: string): void;
  rename(from: string, to: string): void;
}

export const nodeTicketIo: TicketIo = { read: (path) => readFileSync(path, "utf8"), write: (path, text) => writeFileSync(path, text, "utf8"), rename: renameSync };

const WEEK = /^\d{4}-\d{2}-\d{2}$/;

/** Fişin mutlak (symlink çözülmüş) yolu; yoksa ya da hesap klasörünün dışına çıkıyorsa undefined. */
export function findTicketPath(root: string, studioSlug: string, orderId: string): string | undefined {
  if (!existsSync(root)) return undefined;
  const base = resolve(realpathSync(root), studioSlug);
  if (!existsSync(base)) return undefined;
  const baseReal = realpathSync(base);
  for (const week of readdirSync(base).filter((w) => WEEK.test(w))) {
    const candidate = join(base, week, `${orderId}.md`);
    if (!existsSync(candidate)) continue;
    const real = realpathSync(candidate);
    if (real.startsWith(baseReal + sep)) return real;
  }
  return undefined;
}

/** `before` hâlâ dosyadaki metinse `next`'i geçici dosya + `rename` ile yazar (true); arada değiştiyse yazmaz (false). */
export function replaceTicketFile(path: string, before: string, next: string, io: TicketIo = nodeTicketIo): boolean {
  if (io.read(path) !== before) return false;
  const tmp = `${path}.${process.pid}.tmp`;
  io.write(tmp, next);
  io.rename(tmp, path);
  return true;
}
