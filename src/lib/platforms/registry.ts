/**
 * Platform modülü kaydı: UI ve toplama katmanı platforma ada göre değil bu kayıt üzerinden ulaşır.
 * Kayıtsız platform (YouTube) istenirse hata fırlatılır; ekranlar önce `hasPlatformModule` sorar ("yakında").
 * Yeni platform = `src/lib/platforms/<platform>/` modülü + buraya TEK satır (bkz. AGENTS.md "Yeni platform nasıl eklenir").
 */
import { instagramModule } from "@/lib/platforms/instagram";
import { tiktokModule } from "@/lib/platforms/tiktok";
import type { Platform, PlatformModule } from "@/lib/platforms/types";

const MODULES: Partial<Record<Platform, PlatformModule>> = {
  instagram: instagramModule,
  tiktok: tiktokModule,
};

export function hasPlatformModule(platform: Platform): boolean {
  return MODULES[platform] !== undefined;
}

export function getPlatformModule(platform: Platform): PlatformModule {
  const registered = MODULES[platform];
  if (!registered) throw new Error(`Platform modülü henüz kayıtlı değil: ${platform}`);
  return registered;
}

/** Kayıtlı bütün modüller (kayıt sırasıyla). */
export function listPlatformModules(): PlatformModule[] {
  return Object.values(MODULES).filter((module): module is PlatformModule => module !== undefined);
}

/**
 * Bu platformda video incelemesi (geçici indirme + model) yapılabiliyor mu: modül oturumsuz indirilebilen CDN alan adı bildirdiyse evet.
 * Hayırsa inceleme adımı açık sonuç koduyla atlanır; hat sayılar + açıklama ile sürer.
 */
export function supportsVideoInspection(platform: Platform): boolean {
  return MODULES[platform]?.mediaDownload !== undefined;
}

/** Bu platformda resmi yayın var mı (modül yayın kurallarını bildirdiyse). */
export function supportsPublishing(platform: Platform): boolean {
  return MODULES[platform]?.publishing !== undefined;
}
