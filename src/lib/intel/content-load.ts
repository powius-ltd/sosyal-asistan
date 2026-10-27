/**
 * Betiklerin içerik okuması (service role + depo): sayfalı `listContent` ve konu eleği/analiz/transcript satırları.
 * Depo sayfa başına en çok `MAX_PAGE_LIMIT` (200) içerik döner: tümünü toplamak için `nextCursor` izlenir.
 */
import "server-only";

import type { ContentFilter } from "@/lib/data/queries";
import { MAX_PAGE_LIMIT } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";
import type { ContentItem } from "@/lib/domain/content";
import type { AnalysisStatus, ContentAnalysis } from "@/lib/domain/intel";
import { fetchAllRows } from "@/lib/data/supabase/paging";
import type { AdminClient } from "@/lib/supabase/admin";
import type { AnalysisSection, AnalysisLabel } from "@/lib/domain/intel";
import type { Json } from "@/lib/supabase/database.types";

const MAX_PAGES = 50;

/** Filtreye uyan TÜM içerikler (sayfa sayfa). Sayfa sınırı aşılırsa hata (sessiz kesme yok). */
export async function loadAllContent(repo: PanelRepository, wsId: string, filter: Omit<ContentFilter, "limit" | "cursor">): Promise<ContentItem[]> {
  const all: ContentItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await repo.listContent(wsId, { ...filter, limit: MAX_PAGE_LIMIT, cursor });
    all.push(...result.items);
    if (result.nextCursor === undefined) return all;
    cursor = result.nextCursor;
  }
  throw new Error(`İçerik listesi ${MAX_PAGES} sayfayı aştı; okuma durduruldu.`);
}

export interface ScreenInfo {
  inNiche: boolean;
  topic?: string;
  /** Kararı yazan elek istemi sürümü (yeni sonuçta da doludur); güncel sürümden farklıysa bayat (`screen-freshness.ts`). */
  promptVersion?: string;
}

/** `content_items.id` → konu eleği. Satır yok = elenmedi. */
export async function loadScreens(client: AdminClient, wsId: string): Promise<Map<string, ScreenInfo>> {
  const rows = await fetchAllRows((from, to) =>
    client
      .from("content_topic_screens")
      .select("content_item_id, in_niche, topic, prompt_version")
      .eq("workspace_id", wsId)
      .order("content_item_id", { ascending: true })
      .range(from, to)
      .overrideTypes<{ content_item_id: string; in_niche: boolean; topic: string | null; prompt_version: string | null }[], { merge: false }>(),
  );
  return new Map(
    rows.map((row) => [
      row.content_item_id,
      { inNiche: row.in_niche, ...(row.topic === null ? {} : { topic: row.topic }), ...(row.prompt_version === null ? {} : { promptVersion: row.prompt_version }) },
    ]),
  );
}

export interface AnalysisBrief {
  status: AnalysisStatus;
  evidenceVerified: boolean;
  hookText?: string;
  hookType?: string;
  sections: AnalysisSection[];
  labels: AnalysisLabel[];
}

const asList = <T>(value: Json): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** `content_items.id` → analiz özeti (durum, hook, etiketler). */
export async function loadAnalyses(client: AdminClient, wsId: string): Promise<Map<string, AnalysisBrief>> {
  type Row = { content_item_id: string; status: string; evidence_verified: boolean; hook_text: string | null; hook_type: string | null; sections: Json; labels: Json };
  const rows = await fetchAllRows((from, to) =>
    client
      .from("content_analyses")
      .select("content_item_id, status, evidence_verified, hook_text, hook_type, sections, labels")
      .eq("workspace_id", wsId)
      .order("content_item_id", { ascending: true })
      .range(from, to)
      .overrideTypes<Row[], { merge: false }>(),
  );
  return new Map(
    rows.map((row) => [
      row.content_item_id,
      {
        status: row.status as ContentAnalysis["status"],
        evidenceVerified: row.evidence_verified,
        ...(row.hook_text === null ? {} : { hookText: row.hook_text }),
        ...(row.hook_type === null ? {} : { hookType: row.hook_type }),
        sections: asList<AnalysisSection>(row.sections),
        labels: asList<AnalysisLabel>(row.labels),
      },
    ]),
  );
}

export interface TranscriptTexts {
  /** Konuşma metni (kanal speech); süresi dolmuş/boş ise undefined. */
  speech?: string;
  /** Ekran yazıları (kanal screen), birleşik. */
  screen?: string;
  /** Transcript satırının oluşma anı (ISO): ses profilinin bayatlığı için. */
  createdAt: string;
  /** Konuşma dili kodu (`transcripts.language`, ör. "en", "tr", "und"); bilinmiyorsa yok: içerik dili çıkarımında örnek sayılmaz. */
  language?: string;
}

interface SegmentLike {
  text?: unknown;
  channel?: unknown;
}

/**
 * `content_items.id` → transcript metinleri. Süresi dolup silinmiş transcript (text NULL) için giriş yok; süresi dolmuş ama henüz silinmemiş
 * (`expires_at <= now`, purge çalışmadı) transcript de OKUNMAZ: 90 gün kuralı okumada da uygulanır.
 */
export async function loadTranscripts(client: AdminClient, wsId: string, now: Date): Promise<Map<string, TranscriptTexts>> {
  type Row = { content_item_id: string; text: string | null; segments: Json | null; created_at: string; language: string | null };
  const rows = await fetchAllRows((from, to) =>
    client
      .from("transcripts")
      .select("content_item_id, text, segments, created_at, language")
      .eq("workspace_id", wsId)
      .not("text", "is", null)
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
      .order("content_item_id", { ascending: true })
      .range(from, to)
      .overrideTypes<Row[], { merge: false }>(),
  );
  const out = new Map<string, TranscriptTexts>();
  for (const row of rows) {
    const screen = asList<SegmentLike>(row.segments ?? [])
      .filter((segment) => segment.channel === "screen" && typeof segment.text === "string")
      .map((segment) => segment.text as string)
      .join(" ")
      .trim();
    const speech = row.text?.trim() ?? "";
    out.set(row.content_item_id, {
      ...(speech === "" ? {} : { speech }),
      ...(screen === "" ? {} : { screen }),
      createdAt: row.created_at,
      ...(row.language === null ? {} : { language: row.language }),
    });
  }
  return out;
}
