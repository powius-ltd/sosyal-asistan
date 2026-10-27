/**
 * Depo girdisi: rakip / hesap kullanıcı adı doğrulaması (mock ve Supabase AYNI fonksiyon). Önce genel temizlik (kırp, "@" at, küçük
 * harf, `HANDLE_PATTERN`), sonra platformun KESİN kuralı (`PlatformModule.publicData.normalizeHandle`: uzunluk, karakter kümesi).
 * Modülü kayıtlı olmayan platformda yalnız genel kural uygulanır. Sorun varsa `RepositoryError("invalid_input")`.
 */
import { RepositoryError } from "@/lib/data/repository";
import { HANDLE_PATTERN } from "@/lib/domain/competitor";
import { getPlatformModule, hasPlatformModule } from "@/lib/platforms/registry";
import type { Platform } from "@/lib/platforms/types";

/** Platformun kuralına göre geçerli mi (zaten temizlenmiş kullanıcı adı için): normalize sonucu kendisiyle aynıysa geçerlidir. */
export function isValidPlatformHandle(platform: Platform, handle: string): boolean {
  if (!HANDLE_PATTERN.test(handle)) return false;
  return !hasPlatformModule(platform) || getPlatformModule(platform).publicData.normalizeHandle(handle) === handle;
}

/** Ham handle ("@Kahve.Yeri ") → normalize; geçersizse `invalid_input`. */
export function parseHandleInput(platform: Platform, input: unknown): string {
  const handle = String(input ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!isValidPlatformHandle(platform, handle)) throw new RepositoryError("invalid_input", `Geçersiz kullanıcı adı: "${String(input)}"`);
  return handle;
}
