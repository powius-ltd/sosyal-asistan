"use client";

import { useState } from "react";

import { ORDER_MEDIA_NOTE_PLAIN } from "@/lib/plain-language-order";

/** Stüdyo videosunun önizlemesi: `/api/siparis-video/<iş>` akıtır; açılamazsa (dosya yok, işler kapalı) eski not görünür. */
export function OrderVideo({ jobId }: { jobId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="text-xs text-muted-foreground">{ORDER_MEDIA_NOTE_PLAIN}</p>;
  return (
    <video
      controls
      playsInline
      preload="metadata"
      src={`/api/siparis-video/${encodeURIComponent(jobId)}`}
      onError={() => setFailed(true)}
      className="aspect-[9/16] max-h-[60vh] w-auto max-w-full self-start rounded-lg bg-muted object-contain"
    />
  );
}
