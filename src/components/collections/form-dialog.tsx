"use client";

import type { ComponentProps, FormEvent, ReactNode } from "react";

import { TAP_TARGET } from "@/components/notifications/tap";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog'u açan öğe (ör. `<Button>…</Button>`); içeriğiyle birlikte verilir. */
  trigger: ComponentProps<typeof DialogTrigger>["render"];
  title: string;
  description?: ReactNode;
  submitLabel: string;
  pendingLabel: string;
  submitVariant?: "default" | "destructive";
  /** Gönder düğmesi etkin mi (ör. ad boş değil). */
  canSubmit?: boolean;
  pending: boolean;
  onSubmit: () => void;
  /** Form alanları. Alansız onay dialog'unda (silme) verilmez. */
  children?: ReactNode;
}

/** Koleksiyon dialog'larının ortak iskeleti (oluştur / yeniden adlandır / sil onayı): başlık, alanlar, İptal + gönder. */
export function FormDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  submitLabel,
  pendingLabel,
  submitVariant = "default",
  canSubmit = true,
  pending,
  onSubmit,
  children,
}: FormDialogProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit && !pending) onSubmit();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" className={TAP_TARGET} />}>Vazgeç</DialogClose>
            <Button type="submit" variant={submitVariant} disabled={!canSubmit || pending} className={TAP_TARGET}>
              {pending ? pendingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
