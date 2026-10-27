/**
 * Yalnız testler için: aktör şemasından elle kurulmuş TikTok satırları (`fixtures/apify/tiktok/*.json`; gerçek kişi verisi yok).
 * Uygulama kodundan import EDİLMEZ.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Kök `fixtures/apify/tiktok/<ad>.json` dizisini okur (her çağrıda taze kopya: testler birbirini bozmaz). */
export function loadFixture(name: string): Record<string, unknown>[] {
  const url = new URL(`../../../../fixtures/apify/tiktok/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as Record<string, unknown>[];
}

/** Test satırı kurucusu: düz video satırının üstüne alan ekle/değiştir. */
export function videoRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...loadFixture("videos")[0], ...overrides };
}
