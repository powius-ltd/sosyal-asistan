/**
 * Tema seçimi: cihaz tercihi varsayılandır; kullanıcı düğmeyle seçince seçim tarayıcıda (`localStorage`) kalır ve cihaz tercihinin
 * önüne geçer. Seçim `<html class="dark">` ile uygulanır (belirteçler `tokens-dark.css`).
 *
 * Ham betik `<head>` içinde, ilk boyamadan ÖNCE çalışır (yanlış tema parlaması olmasın); `<html>` üstündeki `suppressHydrationWarning`
 * bu sınıf farkını bilerek susturur. `localStorage` engelliyse (özel pencere, çerez engeli) cihaz tercihi kullanılır, hata fırlatmaz.
 * Sunucu çerez okumaz: kök düzen statik kalır.
 */

/** Seçimin saklandığı anahtar: `light` | `dark`; yoksa cihaz tercihi. */
export const THEME_STORAGE_KEY = "sp-theme";

export type ThemeChoice = "light" | "dark";

/** `<head>` için tek satırlık betik (dış bağımlılık yok). */
export const THEME_INIT_SCRIPT = `(function(){var r=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function s(){try{return localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){return null}}function a(){var v=s();r.classList.toggle("dark",v==="dark"||(v!=="light"&&m.matches))}a();m.addEventListener("change",a)})();`;
