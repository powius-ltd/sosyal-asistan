/**
 * Platform süzgeci seçenekleri (SUNUCUDA kurulur; istemci bileşenine prop olarak verilir): bütün platformlar listelenir, modülü
 * kayıtlı olmayan "yakında" etiketiyle ve seçilemez görünür (boş sonuç veren seçenek sunulmaz). Platform adıyla dallanılmaz:
 * yeni modül kayda girince seçenek kendiliğinden açılır (`hasPlatformModule`).
 */
import type { SelectOption } from "@/components/common/labeled-select";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/domain/platform";
import { hasPlatformModule } from "@/lib/platforms/registry";
import { COMING_SOON_PLAIN } from "@/lib/plain-language-results";

export function platformFilterOptions(allLabel: string, allValue: string): SelectOption[] {
  return [
    { value: allValue, label: allLabel },
    ...PLATFORMS.map((platform) =>
      hasPlatformModule(platform)
        ? { value: platform, label: PLATFORM_LABEL[platform] }
        : { value: platform, label: `${PLATFORM_LABEL[platform]} (${COMING_SOON_PLAIN})`, disabled: true },
    ),
  ];
}
