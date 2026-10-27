"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { PublishFormDialog, type PublishFormDialogProps } from "@/components/publish/publish-form-dialog";
import { Button } from "@/components/ui/button";

/** "Yeni yayın" düğmesi + boş form penceresi. Düğme yalnız yayın işi açılabilen hesap varken çizilir (çağıran karar verir). */
export function CreatePublishDialog(props: Omit<PublishFormDialogProps, "open" | "onOpenChange" | "fix">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" className="min-h-tap md:min-h-0" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Yeni yayın
      </Button>
      <PublishFormDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}
