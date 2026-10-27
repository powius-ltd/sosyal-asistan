/**
 * Yalnız testler için: temizlenmiş gerçek Apify çıktıları (`fixtures/apify/instagram/*.json`).
 * Uygulama kodundan import EDİLMEZ.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Kök `fixtures/apify/instagram/<ad>.json` dizisini okur (her çağrıda taze kopya: testler birbirini bozmaz). */
export function loadFixture(name: string): Record<string, unknown>[] {
  const url = new URL(`../../../../fixtures/apify/instagram/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as Record<string, unknown>[];
}

/** Test satırı kurucusu: gerçek bir reel satırının üstüne alan ekle/değiştir. */
export function reelRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...loadFixture("reel")[0], ...overrides };
}
