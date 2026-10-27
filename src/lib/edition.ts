/**
 * Panel sürümü: `PANEL_EDITION` değerini okuyan TEK yer. `kopya` = müşteri kopyası (sade masaüstü kabuğu: solda açılır-kapanır menü,
 * Demirkazık yok, sıcak krem + koyu yeşil, yalnız açık tema); başka her değer ve tanımsız = `saas` (mevcut panel, hiçbir şey değişmez).
 * Yalnız sunucuda okunur: istemci bileşenleri sürümü sunucudan prop olarak alır (istemcide `process.env` okunmaz).
 */
export type PanelEdition = "saas" | "kopya";

export function panelEdition(value: string | undefined = process.env.PANEL_EDITION): PanelEdition {
  return value?.trim() === "kopya" ? "kopya" : "saas";
}

export function isCopyEdition(value?: string | undefined): boolean {
  return value === undefined ? panelEdition() === "kopya" : panelEdition(value) === "kopya";
}
