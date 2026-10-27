/**
 * Hesap ekleme formunun platform seçenekleri (SUNUCUDA kurulur): bütün platformlar listelenir, hangisinin seçilebildiği modül kaydından
 * gelir (`hasPlatformModule`). Platform adıyla dallanılmaz: yeni modül kayda girince seçenek kendiliğinden açılır.
 */
import { PLATFORM_LABEL, PLATFORMS, type Platform } from "@/lib/domain/platform";
import { hasPlatformModule } from "@/lib/platforms/registry";

export interface PlatformOption {
  value: Platform;
  label: string;
  /** Modülü kayıtlı: seçilebilir. Değilse "yakında" rozetiyle görünür, seçilemez. */
  available: boolean;
}

export function onboardingPlatformOptions(): PlatformOption[] {
  return PLATFORMS.map((value) => ({ value, label: PLATFORM_LABEL[value], available: hasPlatformModule(value) }));
}
