/**
 * Panel çalışma alanı → stüdyo çalışma alanı eşlemesi (TEK tablo) ve hesabın üretim modu. Stüdyoda tanımlı olmayan hesap (örn. `ornek`)
 * için fiş YAZILMAZ: sessiz varsayım yok, açık hata. Mod hesaptan seçilir: ornek-studyo motoru metin ister (`senaryo`), anlatım hattı konu
 * ister (`konu`); ornek-studyo `konu` kabul etmez (`schema.ts` de bunu reddeder).
 */
import type { OrderMode } from "@/lib/studio-order/schema";

export interface StudioAccount {
  /** Stüdyodaki çalışma alanı slug'ı (fişte `hesap`). */
  studioSlug: string;
  mode: OrderMode;
}

const STUDIO_ACCOUNTS: Readonly<Record<string, StudioAccount>> = {
  ornekstudyoapp: { studioSlug: "ornek-studyo", mode: "senaryo" },
  "ornek-marka": { studioSlug: "ornek-marka", mode: "konu" },
  "ornek-hesap": { studioSlug: "ornek-hesap", mode: "konu" },
};

export class StudioAccountError extends Error {
  constructor(panelSlug: string) {
    super(
      `"${panelSlug}" stüdyoda tanımlı bir çalışma alanı değil; fiş yazılmaz. Tanımlı olanlar: ${Object.keys(STUDIO_ACCOUNTS).join(", ")}.`,
    );
    this.name = "StudioAccountError";
  }
}

export function studioAccountOf(panelSlug: string | undefined): StudioAccount {
  const found = panelSlug === undefined ? undefined : STUDIO_ACCOUNTS[panelSlug];
  if (found === undefined) throw new StudioAccountError(panelSlug ?? "(slug yok)");
  return found;
}

export function listStudioPanelSlugs(): string[] {
  return Object.keys(STUDIO_ACCOUNTS);
}

/** Fişteki stüdyo slug'ından panel çalışma alanı slug'ı (paylaşımda Zernio anahtarı ve çalışma alanı bundan çözülür). */
export function panelSlugOfStudio(studioSlug: string): string {
  const found = Object.entries(STUDIO_ACCOUNTS).find(([, account]) => account.studioSlug === studioSlug);
  if (found === undefined) throw new StudioAccountError(studioSlug);
  return found[0];
}

/** Atmadan sorgu: stüdyoda tanımlı hesap yoksa `undefined` (fiş uygulama içinde üretilirken tanımsız hesap hata değildir). */
export function findStudioAccount(panelSlug: string | undefined): StudioAccount | undefined {
  return panelSlug === undefined ? undefined : STUDIO_ACCOUNTS[panelSlug];
}

