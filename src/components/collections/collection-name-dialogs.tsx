"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { createCollectionAction, renameCollectionAction } from "@/app/actions/collections";
import { callAction } from "@/components/common/call-action";
import { FormDialog } from "@/components/collections/form-dialog";
import { isOverLimit, LimitCounter } from "@/components/collections/limit-counter";
import { TAP_ICON, TAP_TARGET } from "@/components/notifications/tap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COLLECTION_DESCRIPTION_MAX, COLLECTION_NAME_MAX } from "@/lib/domain/collection";

/** "Yeni koleksiyon" düğmesi + dialog: ad (zorunlu) + açıklama (isteğe bağlı). */
export function CreateCollectionDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setName("");
      setDescription("");
    }
  }

  async function submit() {
    setPending(true);
    const result = await callAction(() => createCollectionAction({ name, description: description.trim() || undefined }));
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    handleOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button className={TAP_TARGET}>
          <Plus aria-hidden />
          Yeni koleksiyon
        </Button>
      }
      title="Yeni koleksiyon"
      description="İçerikleri konuya ya da projeye göre gruplamak için bir ad ver."
      submitLabel="Oluştur"
      pendingLabel="Oluşturuluyor…"
      canSubmit={name.trim() !== "" && !isOverLimit(name, COLLECTION_NAME_MAX) && !isOverLimit(description, COLLECTION_DESCRIPTION_MAX)}
      pending={pending}
      onSubmit={submit}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="collection-name">Ad</Label>
        <Input
          id="collection-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={isOverLimit(name, COLLECTION_NAME_MAX)}
          aria-describedby="collection-name-limit"
          autoComplete="off"
          autoFocus
          className={TAP_TARGET}
        />
        <LimitCounter id="collection-name-limit" value={name} max={COLLECTION_NAME_MAX} label="Ad" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="collection-description">Açıklama (isteğe bağlı)</Label>
        <Textarea
          id="collection-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-invalid={isOverLimit(description, COLLECTION_DESCRIPTION_MAX)}
          aria-describedby="collection-description-limit"
          rows={3}
        />
        <LimitCounter id="collection-description-limit" value={description} max={COLLECTION_DESCRIPTION_MAX} label="Açıklama" />
      </div>
    </FormDialog>
  );
}

interface RenameCollectionDialogProps {
  collectionId: string;
  name: string;
}

/** Koleksiyonu yeniden adlandırır (simge düğmesi + dialog). Ad benzersizliğini depo denetler (`already_exists` → toast). */
export function RenameCollectionDialog({ collectionId, name }: RenameCollectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pending, setPending] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setDraft(name);
  }

  async function submit() {
    setPending(true);
    const result = await callAction(() => renameCollectionAction({ collectionId, name: draft }));
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    setOpen(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Yeniden adlandır: ${name}`} className={TAP_ICON}>
          <Pencil aria-hidden />
        </Button>
      }
      title="Koleksiyonu yeniden adlandır"
      submitLabel="Kaydet"
      pendingLabel="Kaydediliyor…"
      canSubmit={draft.trim() !== "" && !isOverLimit(draft, COLLECTION_NAME_MAX)}
      pending={pending}
      onSubmit={submit}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`rename-${collectionId}`}>Ad</Label>
        <Input
          id={`rename-${collectionId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-invalid={isOverLimit(draft, COLLECTION_NAME_MAX)}
          aria-describedby={`rename-${collectionId}-limit`}
          autoComplete="off"
          autoFocus
          className={TAP_TARGET}
        />
        <LimitCounter id={`rename-${collectionId}-limit`} value={draft} max={COLLECTION_NAME_MAX} label="Ad" />
      </div>
    </FormDialog>
  );
}
