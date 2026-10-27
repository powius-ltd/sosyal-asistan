/**
 * `idea_content_links` satırları → `IdeaLink` / `IdeaReelLink`. İçerik özeti okuma anında içerikten türetilir (saklanan kopya
 * yok); `prev_idea_status` iç durumdur (geri alma DB trigger'ındadır), dışarı verilmez.
 */
import type { ContentSummary } from "@/lib/domain/content-summary";
import type { IdeaLinkOrigin, IdeaLinkStatus, IdeaReelLink } from "@/lib/domain/intel";
import type { IdeaLink } from "@/lib/domain/outcomes";
import type { Tables } from "@/lib/supabase/database.types";
import { iso, opt, stringList } from "@/lib/data/supabase/mappers/common";

export const IDEA_LINK_COLUMNS = "id, workspace_id, idea_id, shortcode, content_item_id, status, origin, score, reasons, created_at, updated_at" as const;

export type IdeaLinkRow = Pick<
  Tables<"idea_content_links">,
  "id" | "workspace_id" | "idea_id" | "shortcode" | "content_item_id" | "status" | "origin" | "score" | "reasons" | "created_at" | "updated_at"
>;

/** Fikir kartındaki aktif bağ için dar sütunlar. */
export const REEL_LINK_COLUMNS = "id, idea_id, shortcode, content_item_id, status, origin" as const;
export type ReelLinkRow = Pick<Tables<"idea_content_links">, "id" | "idea_id" | "shortcode" | "content_item_id" | "status" | "origin">;

const STATUSES: readonly IdeaLinkStatus[] = ["awaiting_content", "suggested", "confirmed", "rejected"];
const ORIGINS: readonly IdeaLinkOrigin[] = ["manual_url", "auto_match"];

/** DB'de check ile korunur; yine de bilinmeyen değer sessizce kabul edilmez. */
function statusOf(value: string): IdeaLinkStatus {
  const found = STATUSES.find((s) => s === value);
  if (!found) throw new Error(`Bilinmeyen bağ durumu: ${value}`);
  return found;
}

function originOf(value: string): IdeaLinkOrigin {
  const found = ORIGINS.find((o) => o === value);
  if (!found) throw new Error(`Bilinmeyen bağ kaynağı: ${value}`);
  return found;
}

export function toIdeaLink(row: IdeaLinkRow, content: ContentSummary | undefined): IdeaLink {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ideaId: row.idea_id,
    shortcode: row.shortcode,
    status: statusOf(row.status),
    origin: originOf(row.origin),
    contentItemId: opt(row.content_item_id),
    content,
    score: opt(row.score),
    reasons: stringList(row.reasons),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** Fikir kartı bağı: yalnız aktif durumlar (`awaiting_content`/`confirmed`) için; diğerleri undefined. */
export function toReelLink(row: ReelLinkRow, content: ContentSummary | undefined): IdeaReelLink | undefined {
  const status = statusOf(row.status);
  if (status !== "awaiting_content" && status !== "confirmed") return undefined;
  return { linkId: row.id, status, origin: originOf(row.origin), shortcode: row.shortcode, contentItemId: opt(row.content_item_id), content };
}
