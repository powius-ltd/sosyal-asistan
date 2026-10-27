"use client";

import { Bookmark, BookmarkPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  addToCollectionAction,
  createCollectionAction,
  getContentCollectionsAction,
  removeFromCollectionAction,
} from "@/app/actions/collections";
import { callAction } from "@/components/common/call-action";
import { CollectionChecklist } from "@/components/collections/collection-checklist";
import type { CollectionOption } from "@/components/collections/collection-option";
import { NewCollectionForm } from "@/components/collections/new-collection-form";
import { TAP_TARGET } from "@/components/notifications/tap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { COLLECTION_NOTE_MAX } from "@/lib/domain/collection";
import { ROUTES } from "@/lib/routes";

interface SaveToCollectionMenuProps {
  contentId: string;
  /** Sayfanın TOPLU okuduğu üyelik (düğmenin "Kaydedildi" durumu için); bilinmiyorsa undefined → menü açılınca yüklenir. */
  initialCollectionIds?: string[];
}

/**
 * "Kaydet" açılır menüsü (istemci yaprağı): içeriğin hangi koleksiyonlarda olduğunu işaretli listeler, tıklayınca
 * ekler/çıkarır, satır içinde yeni koleksiyon oluşturur. Menü kendiliğinden okuma yapmaz: düğmenin kaydedildi durumu
 * sayfanın tek toplu okumasından gelen `initialCollectionIds`'ten (`loadCollectionMembership`); koleksiyon listesi ise
 * yalnız menü AÇILINCA (tıklayan kart için) bir kez çekilir.
 */
export function SaveToCollectionMenu({ contentId, initialCollectionIds }: SaveToCollectionMenuProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CollectionOption[]>();
  const [memberIds, setMemberIds] = useState<string[]>(initialCollectionIds ?? []);
  const [loadError, setLoadError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const saved = memberIds.length > 0;

  /** Listenin ilk koleksiyon kutusu (yoksa undefined). */
  const firstCheckbox = () => listRef.current?.querySelector<HTMLElement>('[role="checkbox"]') ?? undefined;

  // Önce koleksiyon seçilir (not seçimden ÖNCE yazılırsa eklenen kayda gider): odak ilk koleksiyon kutusundadır. Liste menü açıldıktan
  // sonra yükleniyorsa (ilk açılış) odak yüklenince oraya taşınır; kullanıcı o arada not alanına yazmaya başladıysa ona dokunulmaz.
  useEffect(() => {
    if (!open || !options || options.length === 0) return;
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement && active.value !== "";
    if (!typing && !listRef.current?.contains(active)) firstCheckbox()?.focus();
  }, [open, options]);

  async function load() {
    const result = await callAction(() => getContentCollectionsAction({ contentId }));
    if (result.ok) {
      setOptions(result.collections);
      setMemberIds(result.memberIds);
      setLoadError(undefined);
    } else if (!options) {
      setLoadError(result.message);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void load();
  }

  async function toggle(option: CollectionOption, checked: boolean) {
    setBusy(true);
    const result = await callAction(() =>
      checked
        ? addToCollectionAction({ collectionId: option.id, contentId, note: note.trim() || undefined })
        : removeFromCollectionAction({ collectionId: option.id, contentId }),
    );
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setMemberIds((ids) => (checked ? [...new Set([...ids, option.id])] : ids.filter((id) => id !== option.id)));
    if (checked) setNote("");
    toast.success(result.message);
  }

  async function create(name: string): Promise<boolean> {
    setBusy(true);
    const result = await callAction(() => createCollectionAction({ name, contentId, note: note.trim() || undefined }));
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    setOptions((list) => [result.collection, ...(list ?? []).filter((o) => o.id !== result.collection.id)]);
    setMemberIds((ids) => [...new Set([...ids, result.collection.id])]);
    setNote("");
    toast.success(result.message);
    return true;
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={<Button type="button" variant="outline" size="sm" data-content-id={contentId} className={TAP_TARGET} />}>
        {saved ? (
          <Bookmark className="fill-current" data-icon="inline-start" aria-hidden />
        ) : (
          <BookmarkPlus data-icon="inline-start" aria-hidden />
        )}
        {saved ? "Kaydedildi" : "Kaydet"}
      </PopoverTrigger>
      <PopoverContent align="end" initialFocus={() => firstCheckbox() ?? false}>
        <PopoverHeader>
          <PopoverTitle>Koleksiyona kaydet</PopoverTitle>
        </PopoverHeader>

        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Not (isteğe bağlı)"
          aria-label="Not (isteğe bağlı)"
          maxLength={COLLECTION_NOTE_MAX}
          autoComplete="off"
          className={TAP_TARGET}
        />

        {loadError ? (
          <p role="alert" className="px-1 py-2 text-xs text-destructive">
            {loadError}
          </p>
        ) : options === undefined ? (
          <p role="status" className="px-1 py-2 text-xs text-muted-foreground">
            Koleksiyonlar yükleniyor…
          </p>
        ) : (
          <div ref={listRef}>
            <CollectionChecklist options={options} memberIds={memberIds} disabled={busy} onToggle={toggle} />
          </div>
        )}

        <Separator />
        <NewCollectionForm disabled={busy || options === undefined} onCreate={create} />
        <Link href={ROUTES.collections} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground hover:underline max-md:min-h-tap">
          Tüm koleksiyonlara git
        </Link>
      </PopoverContent>
    </Popover>
  );
}
