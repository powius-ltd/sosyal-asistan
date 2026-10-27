"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { deleteCollectionAction } from "@/app/actions/collections";
import { callAction } from "@/components/common/call-action";
import { TAP_ICON } from "@/components/notifications/tap";
import { FormDialog } from "@/components/collections/form-dialog";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

interface DeleteCollectionDialogProps {
  collectionId: string;
  name: string;
  itemCount: number;
  /** Verilirse silince buraya gidilir (koleksiyon ayrıntısı açıkken listeye dönmek için). */
  redirectTo?: string;
}

/** Silme onay dialog'u: koleksiyon ve içindeki kayıtlar silinir; kaydedilen içerikler (videolar) silinmez. */
export function DeleteCollectionDialog({ collectionId, name, itemCount, redirectTo }: DeleteCollectionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    const result = await callAction(() => deleteCollectionAction({ collectionId }));
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    setOpen(false);
    if (redirectTo) router.replace(redirectTo);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Sil: ${name}`} className={TAP_ICON}>
          <Trash2 aria-hidden />
        </Button>
      }
      title="Koleksiyonu sil"
      description={
        <>
          “{name}” koleksiyonu ve içindeki {formatNumber(itemCount)} kayıt silinecek. Kaydedilen içerikler (videolar)
          silinmez, yalnız bu gruptan çıkar. Bu işlem geri alınamaz.
        </>
      }
      submitLabel="Sil"
      pendingLabel="Siliniyor…"
      submitVariant="destructive"
      pending={pending}
      onSubmit={submit}
    />
  );
}
