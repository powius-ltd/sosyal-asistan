/**
 * Rapor kâğıda gider: koyu temada da AÇIK çizilir. Tema sınıfı (`<html class="dark">`) `<head>` betiğiyle ilk boyamadan önce konur;
 * bu betik gövdenin en başında çalışıp sınıfı kaldırır (ilk boyamada koyu parlama olmaz) ve yazdırmadan hemen önce yine kaldırır
 * (cihaz teması yazdırma sırasında değişse bile). Renkleri değiştirmez: açık tema belirteçleri zaten `:root`'tadır.
 * Sabit bir dizedir (dış girdi yok). Rapor yeni sekmede (tam sayfa yüklemesi) açıldığından panele dönülünce tema yeniden gelir.
 */
const LIGHT_ONLY_SCRIPT = `(function(){var r=document.documentElement;function l(){r.classList.remove("dark")}l();addEventListener("beforeprint",l)})();`;

export function LightThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: LIGHT_ONLY_SCRIPT }} />;
}
