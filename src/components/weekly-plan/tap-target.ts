/**
 * Dar ekranda dokunma hedefi ≥ 48 px (`min-h-tap`), `md`+ ta ince (D2-13). Bugün'deki kuralla aynıdır (`today/decision-actions.tsx`).
 * `TAP`: kendi kutusu olan düğme / bağlantı. `TAP_LINKS`: `ContentLink` gibi içinde bağlantı çizen bileşenin sarmalayıcı sınıfı
 * (ortak bileşene dokunmadan içteki `<a>`'yı büyütür).
 */
export const TAP = "min-h-tap md:min-h-0";
export const TAP_LINKS = "[&_a]:inline-flex [&_a]:min-h-tap [&_a]:items-center md:[&_a]:min-h-0";
