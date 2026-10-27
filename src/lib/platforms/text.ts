/**
 * Platforma göre değişen müşteri metni (içerik türü adı, alan örnekleri): TEK yer. Ekran platform adıyla dallanmaz,
 * `platformText(platform)` sorar. Modülü kayıtlı olmayan platformda tarafsız varsayılan döner ("video").
 */
import { getPlatformModule, hasPlatformModule } from "@/lib/platforms/registry";
import type { Platform, PlatformText } from "@/lib/platforms/types";

const NEUTRAL_TEXT: PlatformText = {
  contentNoun: "video",
  handlePlaceholder: "@kullaniciadi ya da profil bağlantısı",
  contentUrlPlaceholder: "Video bağlantısı",
  contentUrlHint: "video adresi",
};

export function platformText(platform: Platform | undefined): PlatformText {
  return platform !== undefined && hasPlatformModule(platform) ? getPlatformModule(platform).text : NEUTRAL_TEXT;
}

/** İçerik türünün adı ("Reels" / "video"); platform bilinmiyorsa "video". */
export function contentNoun(platform: Platform | undefined): string {
  return platformText(platform).contentNoun;
}
