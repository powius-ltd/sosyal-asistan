"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface JobActionsSummary {
  account: string;
  caption?: string;
  /** Önceden biçimlendirilmiş planlanan zaman ("30 Eyl 2026 14:05"); yoksa undefined. */
  when?: string;
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  /** Onay düğmesini devre dışı bırakır (ör. uyum denetimi `fail`). */
  confirmDisabled?: boolean;
  pending: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}

/** Onay / iptal pencereleri için ortak çerçeve: başlık, açıklama, içerik, "Vazgeç" + onay düğmesi (dar ekranda 48 px). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = "default",
  confirmDisabled = false,
  pending,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} className="min-h-tap md:min-h-0" />}>Vazgeç</DialogClose>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={pending || confirmDisabled} className="min-h-tap md:min-h-0">
            {pending ? "İşleniyor…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function JobSummary({ summary }: { summary: JobActionsSummary }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted/50 p-3 text-sm">
      <dt className="text-muted-foreground">Hesap</dt>
      <dd className="font-medium">{summary.account}</dd>
      <dt className="text-muted-foreground">Zaman</dt>
      <dd>{summary.when ?? "Onaydan sonra hemen"}</dd>
      <dt className="text-muted-foreground">Açıklama</dt>
      <dd className="line-clamp-3 whitespace-pre-line">{summary.caption ?? "—"}</dd>
    </dl>
  );
}
