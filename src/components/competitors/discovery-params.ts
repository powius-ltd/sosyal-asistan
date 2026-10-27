/**
 * Keşfet ekranı URL parametreleri (`?kaynak=related|search&benzer=1`). Saf; sunucu ve istemci kullanır.
 */
import type { DiscoveryFilter } from "@/lib/data/queries";
import { first, type RawSearchParams } from "@/lib/search-params";

export const DISCOVERY_PARAM = { source: "kaynak", similar: "benzer" } as const;

export type DiscoverySource = NonNullable<DiscoveryFilter["source"]>;

export const DISCOVERY_SOURCES: readonly DiscoverySource[] = ["related", "search"];

export interface DiscoveryUiState {
  source?: DiscoverySource;
  similarSizeOnly: boolean;
}

export function parseDiscoveryParams(raw: RawSearchParams): DiscoveryUiState {
  const source = first(raw[DISCOVERY_PARAM.source]);
  return {
    source: DISCOVERY_SOURCES.find((s) => s === source),
    similarSizeOnly: first(raw[DISCOVERY_PARAM.similar]) === "1",
  };
}

export function toDiscoveryFilter(state: DiscoveryUiState): DiscoveryFilter {
  return {
    ...(state.source ? { source: state.source } : {}),
    ...(state.similarSizeOnly ? { similarSizeOnly: true } : {}),
  };
}
