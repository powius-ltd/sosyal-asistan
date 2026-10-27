/**
 * Dokunma hedefi: dar ekranda ≥ 48 px (`min-h-tap`), `md`+ kendi yüksekliğinde. Sabit yükseklikli düğme / bağlantıya eklenir
 * (`min-height` yüksekliğin önüne geçer); satır içi bağlantıya `inline-flex items-center` ile birlikte verilir.
 */
export const TAP_TARGET = "min-h-tap md:min-h-0";

/** `ContentLink` gibi bağlantıyı kendi içinde çizen bileşenlerin ilk bağlantısı: dikey dolguyla 20 px satır ≈ 48 px olur (kısaltma bozulmaz). */
export const TAP_FIRST_LINK = "[&>a:first-child]:py-3.5 md:[&>a:first-child]:py-0";

/** `ContentLink` başlığı kesmesin, satır sonuna sarsın (çarpan gibi başlıktaki bilgi dar ekranda kaybolmaz; D3-10). */
export const WRAP_FIRST_LINK =
  "[&>a:first-child]:overflow-visible [&>a:first-child]:text-clip [&>a:first-child]:whitespace-normal [&>a:first-child]:break-words";

/** Simge düğmesi (28 px `icon-sm`) dar ekranda 48 px kare olur; `md`+ kendi boyunda kalır (D3-13). */
export const TAP_ICON = "max-md:size-12";
