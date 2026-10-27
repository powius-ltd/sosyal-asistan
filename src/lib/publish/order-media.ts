/**
 * Stüdyo videosunun yolu (TEK yer): yayın satırında `siparis:<hesap>/<hafta>/<siparis_id>/final.mp4` önekli GÖRELİ yol; dosya yalnız sipariş
 * kökünün (`SIPARIS_KOK`, varsayılan `/opt/panel/siparisler`) içinde çözülür. `..`, mutlak yol ve kök dışına çıkan sembolik bağ reddedilir
 * (`realpath` ile denetlenir): fişe yazılan değer panelin diskte rastgele dosya okumasına yol açamaz. Kök aslında `<SIPARIS_KOK>/<stüdyo hesabı>`:
 * bir hesabın satırı başka hesabın klasöründeki videoyu gösteremez. Tür (.mp4) ve boyut (300 MB) sınırı betikle ORTAK (`orderVideoProblem`).
 */
import "server-only";
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { isOrderMediaPath, ORDER_MEDIA_PREFIX } from "@/lib/order-media-path";
import { orderRootOf } from "@/lib/studio-order/order-root";

export class OrderMediaError extends Error {
  constructor(
    readonly code: "invalid_path" | "outside_root" | "missing" | "invalid_type" | "too_large",
    message: string,
  ) {
    super(message);
    this.name = "OrderMediaError";
  }
}

export function ordersRootOf(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return orderRootOf(env);
}

/** Reel video sınırı (Instagram): betik (`zernio-paylas`) ve panel yolu AYNI kuralı kullanır. */
export const ORDER_VIDEO_MAX_BYTES = 300 * 1024 * 1024;

/** Dosya adı ve boyuta göre sorun (yoksa undefined). SAF. */
export function orderVideoProblem(fileName: string, sizeBytes: number): { code: "invalid_type" | "too_large"; message: string } | undefined {
  if (!fileName.toLowerCase().endsWith(".mp4")) return { code: "invalid_type", message: "yalnız .mp4" };
  if (sizeBytes > ORDER_VIDEO_MAX_BYTES) return { code: "too_large", message: `video ${(sizeBytes / 1048576).toFixed(1)} MB; Reel sınırı 300 MB` };
  return undefined;
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** `siparis:` önekli yolu `<kök>/<stüdyo hesabı>` içinde mutlak dosya yoluna çevirir; dosya olmalı, .mp4 ve ≤ 300 MB. */
export function resolveOrderMedia(root: string, mediaPath: string, studioSlug: string): string {
  if (!isOrderMediaPath(mediaPath)) throw new OrderMediaError("invalid_path", "Medya yolu stüdyo siparişi yolu değil.");
  const segments = mediaPath.slice(ORDER_MEDIA_PREFIX.length).split("/");
  if (segments.length < 2 || segments.some((s) => s === ".." || s === "." || !SEGMENT.test(s))) throw new OrderMediaError("invalid_path", "Medya yolu geçersiz.");
  if (segments[0] !== studioSlug) throw new OrderMediaError("outside_root", "Video başka bir hesabın klasöründe.");
  if (!existsSync(resolve(realpathSync(root), studioSlug))) throw new OrderMediaError("missing", "Hesap klasörü bulunamadı.");
  const rootReal = realpathSync(resolve(realpathSync(root), studioSlug));
  const candidate = resolve(realpathSync(root), ...segments);
  if (!existsSync(candidate)) throw new OrderMediaError("missing", "Video dosyası bulunamadı.");
  const real = realpathSync(candidate);
  if (!real.startsWith(rootReal + sep)) throw new OrderMediaError("outside_root", "Video dosyası sipariş klasörünün dışına çıkıyor.");
  const problem = orderVideoProblem(real, statSync(real).size);
  if (problem) throw new OrderMediaError(problem.code, `Video dosyası geçersiz: ${problem.message}.`);
  return real;
}

/**
 * Fişteki yol (fişin klasörüne göre göreli ya da mutlak) → `siparis:` önekli göreli yol. Kök dışındaysa ya da dosya yoksa hata.
 * Dönen yol `resolveOrderMedia` ile doğrulanmıştır.
 */
export function toOrderMediaPath(root: string, ticketDir: string, ticketValue: string, studioSlug: string): string {
  const absolute = isAbsolute(ticketValue) ? ticketValue : resolve(ticketDir, ticketValue);
  if (!existsSync(absolute)) throw new OrderMediaError("missing", "Video dosyası bulunamadı.");
  const rel = relative(realpathSync(root), realpathSync(absolute));
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw new OrderMediaError("outside_root", "Video dosyası sipariş klasörünün dışında.");
  const path = `${ORDER_MEDIA_PREFIX}${rel.split(sep).join("/")}`;
  resolveOrderMedia(root, path, studioSlug);
  return path;
}
