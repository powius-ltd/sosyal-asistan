"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { removeFromCollectionAction } from "@/app/actions/collections";
import { callAction } from "@/components/common/call-action";
import { TAP_ICON } from "@/components/notifications/tap";
import { Button } from "@/components/ui/button";

interface RemoveItemButtonProps {
  collectionId: string;
  contentId: string;
  /** Ekran okuyucu için hangi içerik olduğu (alt yazı özeti ya da hesap adı). */
  label: string;
}

/** Öğeyi koleksiyondan çıkarır (içerik silinmez; not da gider). Onay istemez: "Kaydet" menüsünden geri eklenebilir. */
export function RemoveItemButton({ collectionId, contentId, label }: RemoveItemButtonProps) {
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    const result = await callAction(() => removeFromCollectionAction({ collectionId, contentId }));
    setPending(false);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Koleksiyondan çıkar: ${label}`}
      disabled={pending}
      onClick={remove}
      className={TAP_ICON}
    >
      <X aria-hidden />
    </Button>
  );
}
