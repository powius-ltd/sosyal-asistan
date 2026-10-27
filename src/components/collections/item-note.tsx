"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { updateCollectionItemNoteAction } from "@/app/actions/collections";
import { callAction } from "@/components/common/call-action";
import { TAP_TARGET } from "@/components/notifications/tap";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COLLECTION_NOTE_MAX } from "@/lib/domain/collection";

interface ItemNoteProps {
  collectionId: string;
  contentId: string;
  note?: string;
}

/** Koleksiyon öğesinin notu: metin + "Notu düzenle" → satır içi düzenleme (boş kaydetmek notu siler). */
export function ItemNote({ collectionId, contentId, note }: ItemNoteProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [pending, setPending] = useState(false);

  function startEditing() {
    setDraft(note ?? "");
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await callAction(() => updateCollectionItemNoteAction({ collectionId, contentId, note: draft }));
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        {note ? (
          <p className="min-w-0 flex-1 whitespace-pre-line rounded-md bg-muted px-2 py-1.5 text-sm">{note}</p>
        ) : (
          <p className="flex-1 py-1 text-xs text-muted-foreground">Not yok.</p>
        )}
        <Button type="button" variant="ghost" size="xs" onClick={startEditing} className={TAP_TARGET}>
          {note ? "Notu düzenle" : "Not ekle"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="grid gap-2">
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Not"
        maxLength={COLLECTION_NOTE_MAX}
        rows={2}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={pending} className={TAP_TARGET}>
          Vazgeç
        </Button>
        <Button type="submit" size="sm" disabled={pending} className={TAP_TARGET}>
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}
