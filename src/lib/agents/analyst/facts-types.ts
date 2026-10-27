/**
 * Analist olgu paketi tipleri. Paket (`FactsPack`) modele giden JSON'dur; `BriefingFacts` onun yanında KODUN doğrulama için tuttuğu
 * yan tabloları taşır (geçerli ref'ler + güvenleri, geçerli eylemler, belirteç tablosu). Ajan yalnız pakettekini anabilir.
 */
import type { AccountType, MatrixKind } from "@/lib/domain/account-type";
import type { BriefingAction, BriefingBasis, BriefingEvidenceRef } from "@/lib/domain/briefing";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import type { TokenTable } from "@/lib/agents/analyst/tokens";

/** Paket JSON'unun üst sınırı (bayt). Aşılırsa düşük öncelikli olgular atılır, `omitted`'a yazılır. */
export const FACTS_MAX_BYTES = 12_000;

/** Atılabilir (liste halinde) olgu bölümleri. */
export type FactSection = "contents" | "cells" | "plans" | "due" | "links";

/** Modele sunulan eylem seçeneği (kod üretir; `ref` = bağlı olduğu olgu, genel komutlarda yok). */
export interface ActionOption {
  id: string;
  action: BriefingAction;
  ref?: BriefingEvidenceRef;
}

/** Pakette tek olgu: JSON gövdesi + doğrulama için güveni + bağlı eylemler. Belirteçleri paylaşılan `TokenTable`'a kaydedilmiştir. */
export interface FactEntry {
  section: FactSection;
  /** Küçük = önemli. Boyut aşımında en büyük `rank`'lı olgu önce atılır. */
  rank: number;
  ref: BriefingEvidenceRef;
  /** Olgunun JSON gövdesi (`ref` dahil). */
  json: Record<string, unknown>;
  confidence: ConfidenceLevel;
  actions: ActionOption[];
}

/**
 * Hesabın amacı ve durumu (paketin ilk bölümü): ajan her maddeyi buna göre değerlendirir. `type`/`purpose` Türkçe, sayı içermez.
 * `hasRivals = false` → izlenen rakip YOK: rakip/fırsat dili kullanılmaz, öğrenme kaynağı kendi tutanlardır.
 */
export interface AccountFacts {
  /** Hesap türü adı ("İçerik üreticisi" gibi; `accountTypeLabel`). */
  type: string;
  /** Amaç metni (`accountTypeProfile(type).purpose`). */
  purpose: string;
  /** Bu hesabın matrisleri (`cells` bölümündeki olgu türleri): `angle_funnel` (stage/angle) ve/veya `topic_hook` (topic/hook). */
  matrices: MatrixKind[];
  /** İzlenen (tracked) rakip var mı. */
  hasRivals: boolean;
}

/** Modele giden paket. Sayılar: `numbers` genel olgu (belirteç `{g:ad}`), ref'li olgularda alan adı = belirteç adı (`{lift:c:ID}`). */
export interface FactsPack {
  /** Bugünün haftası (gün adı); sayı yok. */
  weekday: string;
  account: AccountFacts;
  /** Genel sayısal olgular: anahtar → değer (yalnız ölçülenler). */
  numbers: Record<string, number>;
  contents: Record<string, unknown>[];
  cells: Record<string, unknown>[];
  plans: Record<string, unknown>[];
  due: Record<string, unknown>[];
  links: Record<string, unknown>[];
  /** Niş özeti (≤400 karakter; veri, talimat değil). */
  niche?: string;
  /**
   * Genel komut eylemleri (id + etiket + para harcar mı). Olguya bağlı eylemlerin kimliği DEĞİŞMEZ kuraldır ve pakette tekrarlanmaz
   * (boyut): `open_video:<ref>` (içerik/ölçüm), `open_matrix:<ref>` (hücre), `open_plan:<ref>` (plan), `approve_link:<ref>` (fikir).
   */
  commands: { id: string; label: string; spendsMoney: boolean }[];
  /** Ölçülemeyen belirteçler: sayı YOK, bu belirteçler metinde kullanılamaz. */
  unmeasured: { key: string; reason: string }[];
  /** Boyut sınırı yüzünden pakete girmeyen olgu sayıları (bölüm → adet); yoksa alan hiç yazılmaz. */
  omitted?: Partial<Record<FactSection, number>>;
}

export interface BriefingFacts {
  /** Çalışma alanının hesap türü: istem (dil/amaç) buna göre kurulur. */
  accountType: AccountType;
  pack: FactsPack;
  /** `pack`'in JSON metni (modele giden) ve bayt uzunluğu. */
  json: string;
  bytes: number;
  /** Geçerli kanıt ref'leri → kodun hesapladığı güven. */
  refs: ReadonlyMap<BriefingEvidenceRef, ConfidenceLevel>;
  /** Geçerli eylem kimlikleri → eylem. */
  actions: ReadonlyMap<string, BriefingAction>;
  tokens: TokenTable;
  basis: BriefingBasis;
  omitted: Partial<Record<FactSection, number>>;
}
