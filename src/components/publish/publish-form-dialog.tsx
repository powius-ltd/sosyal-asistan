"use client";

import Link from "next/link";
import { useState, useTransition, type TransitionStartFunction } from "react";
import { toast } from "sonner";

import { createPublishJob } from "@/app/actions/publish";
import { replacePublishJob } from "@/app/actions/publish-replace";
import { Hint } from "@/components/common/hint";
import { CompliancePanel } from "@/components/publish/compliance-panel";
import { DisclosureFields } from "@/components/publish/disclosure-fields";
import { PublishFieldError } from "@/components/publish/publish-field-error";
import { EMPTY_FLAGS, toComplianceInput, toPublishPayload, type PublishFlags } from "@/components/publish/publish-flags";
import { captionLimitText, firstFieldError, type FieldError, type PublishPrefill } from "@/components/publish/publish-form-state";
import { PUBLISH_FIELD_ID, fieldOfMessage, type PublishField } from "@/components/publish/publish-messages";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { checkCompliance } from "@/lib/compliance";
import type { ComplianceRegion } from "@/lib/domain/compliance";
import { PLATFORM_LABEL, type Platform } from "@/lib/domain/platform";
import { CAPTION_MAX, countCaptionChars } from "@/lib/domain/publish";
import { FIX_PARTIAL_WARNING, FIX_PLAIN, NO_CONNECTED_ACCOUNT_NOTE, VIDEO_UPLOAD_SOON, type FixMode } from "@/lib/plain-language-publish";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

export interface PublishAccountOption {
  id: string;
  handle: string;
  platform: Platform;
}

/** "Kopyala ve düzelt" açılışı: hangi işin yerine geçeceği, düğme biçimi ve forma konacak değerler. */
export interface PublishFix {
  jobId: string;
  mode: FixMode;
  prefill: PublishPrefill;
}

export interface PublishFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Yalnız resmi API ile bağlı (yayın yapabilen) hesaplar. */
  accounts: PublishAccountOption[];
  timeZone: string;
  /** Workspace'in uyum bölgesi: açıklama bu bölgenin kurallarına göre canlı denetlenir. */
  complianceRegion: ComplianceRegion;
  /** Yönetici modu: uyum bulgularında kural kodu da görünür. */
  operator?: boolean;
  fix?: PublishFix;
}

/** Hata alanına odak: alan kimliğiyle (seçici de metin alanı da aynı yoldan). */
function focusField(field: PublishField) {
  document.getElementById(PUBLISH_FIELD_ID[field])?.focus();
}

interface BodyProps extends Omit<PublishFormDialogProps, "open" | "onOpenChange"> {
  pending: boolean;
  startTransition: TransitionStartFunction;
  onDone: () => void;
}

/** Form + alt çubuk. Dialog açıkken bağlanır (kapanınca düşer), bu yüzden her açılışta değerler baştan kurulur. */
function PublishFormBody({ accounts, timeZone, complianceRegion, operator = false, fix, pending, startTransition, onDone }: BodyProps) {
  const prefill = fix?.prefill;
  // Tek hesapta kendiliğinden seçili; kopyalanan işin hesabı artık yayın açabilen hesaplar arasında değilse boş (kullanıcı seçer).
  const [accountId, setAccountId] = useState(() => {
    if (prefill && accounts.some((account) => account.id === prefill.socialAccountId)) return prefill.socialAccountId;
    return accounts.length === 1 ? accounts[0].id : "";
  });
  const [caption, setCaption] = useState(prefill?.caption ?? "");
  const [scheduledAt, setScheduledAt] = useState(prefill?.scheduledAt ?? "");
  const [flags, setFlags] = useState<PublishFlags>(prefill?.flags ?? EMPTY_FLAGS);
  const [error, setError] = useState<FieldError | undefined>();

  const length = countCaptionChars(caption);
  const limitText = captionLimitText(caption);
  // Canlı uyum denetimi (depoda da uygulanır): `fail` iken onaya gönderilemez, taslak kaydedilebilir.
  const compliance = checkCompliance(toComplianceInput(caption, flags, complianceRegion));
  const blocked = compliance.status === "fail";
  const accountItems = accounts.map((a) => ({ value: a.id, label: `@${a.handle} · ${PLATFORM_LABEL[a.platform]}` }));

  const errorOf = (field: PublishField) => (error?.field === field ? error.message : undefined);
  const captionMessage = errorOf("caption") ?? limitText;
  const clearError = (field: PublishField) => setError((current) => (current?.field === field ? undefined : current));

  function fail(next: FieldError) {
    setError(next);
    // Hata yazıldıktan sonra alan işaretlenir; odak bir sonraki çizimde oraya taşınır.
    window.setTimeout(() => focusField(next.field), 0);
  }

  function submit(status: "draft" | "awaiting_approval") {
    const problem = firstFieldError({ accountId, caption, status });
    if (problem) return fail(problem);
    setError(undefined);
    startTransition(async () => {
      const job = { socialAccountId: accountId, caption, scheduledAt, ...toPublishPayload(flags), status };
      const result = fix ? await replacePublishJob({ replacesJobId: fix.jobId, job }) : await createPublishJob(job);
      if (!result.ok) {
        const field = fieldOfMessage(result.message);
        if (field) fail({ field, message: result.message });
        else toast.error(result.message);
        return;
      }
      if (fix) {
        if ("oldCancelled" in result && result.oldCancelled === false) toast.warning(FIX_PARTIAL_WARNING);
        else toast.success(FIX_PLAIN[fix.mode].success);
      } else {
        toast.success(status === "draft" ? "Taslak kaydedildi." : "Yayın onaya gönderildi.");
      }
      onDone();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{fix ? FIX_PLAIN[fix.mode].title : "Yeni yayın"}</DialogTitle>
        <DialogDescription>
          {fix ? FIX_PLAIN[fix.mode].description : "Yayın işi taslak ya da onay bekliyor olarak oluşur. Hiçbir yayın onayın olmadan gönderilmez."}
        </DialogDescription>
      </DialogHeader>

      {accounts.length === 0 ? (
        <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          {NO_CONNECTED_ACCOUNT_NOTE}{" "}
          <Link href={ROUTES.settings} className="underline hover:text-foreground">
            Ayarlar&apos;a git
          </Link>
          .
        </p>
      ) : (
        <form
          id="create-publish-form"
          className="flex min-w-0 flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit("draft");
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={PUBLISH_FIELD_ID.account}>Hesap</Label>
            <Select
              items={accountItems}
              value={accountId}
              onValueChange={(v) => {
                setAccountId(v ?? "");
                clearError("account");
              }}
            >
              <SelectTrigger
                id={PUBLISH_FIELD_ID.account}
                className="w-full min-h-tap md:min-h-0"
                aria-invalid={errorOf("account") !== undefined}
                aria-describedby={errorOf("account") ? `${PUBLISH_FIELD_ID.account}-error` : undefined}
              >
                <SelectValue placeholder="Hesap seç" />
              </SelectTrigger>
              <SelectContent>
                {accountItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PublishFieldError field="account" message={errorOf("account")} />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={PUBLISH_FIELD_ID.caption}>Açıklama</Label>
              <span
                className={cn("text-xs tabular", limitText ? "font-medium text-destructive" : "text-muted-foreground")}
                aria-label={`${length} karakter, en fazla ${CAPTION_MAX}`}
              >
                {length} / {CAPTION_MAX}
              </span>
            </div>
            <Textarea
              id={PUBLISH_FIELD_ID.caption}
              value={caption}
              onChange={(event) => {
                setCaption(event.target.value);
                clearError("caption");
              }}
              placeholder="Videonun açıklaması ve hashtag'ler"
              aria-invalid={captionMessage !== undefined}
              aria-describedby={captionMessage ? `${PUBLISH_FIELD_ID.caption}-error` : undefined}
              // Alan büyümez: sınır aşılsa da pencere taşmaz, içerik alanın içinde kayar; boşluksuz metin de satır sonunda kırılır.
              className="max-h-56 min-h-28 overflow-y-auto [overflow-wrap:anywhere]"
            />
            <PublishFieldError field="caption" message={captionMessage} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={PUBLISH_FIELD_ID.scheduledAt}>Planlanan zaman</Label>
            <Input
              id={PUBLISH_FIELD_ID.scheduledAt}
              type="datetime-local"
              className="min-h-tap md:min-h-0"
              value={scheduledAt}
              onChange={(event) => {
                setScheduledAt(event.target.value);
                clearError("scheduledAt");
              }}
              aria-invalid={errorOf("scheduledAt") !== undefined}
              aria-describedby={errorOf("scheduledAt") ? `${PUBLISH_FIELD_ID.scheduledAt}-error` : undefined}
            />
            <PublishFieldError field="scheduledAt" message={errorOf("scheduledAt")} />
            <p className="text-xs text-muted-foreground">Saat dilimi: {timeZone}. Boş bırakılırsa onaydan sonra hemen yayınlanır.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pj-video">Video dosyası</Label>
            <Hint content={VIDEO_UPLOAD_SOON} label="Video yükleme devre dışı">
              <Input id="pj-video" type="file" accept="video/mp4,video/quicktime" disabled />
            </Hint>
            <p className="text-xs text-muted-foreground">{VIDEO_UPLOAD_SOON}</p>
          </div>

          <DisclosureFields value={flags} onChange={(patch) => setFlags((current) => ({ ...current, ...patch }))} disabled={pending} />
          <CompliancePanel result={compliance} region={complianceRegion} showRuleIds={operator} />
        </form>
      )}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" disabled={pending} className="min-h-tap md:min-h-0" />}>Vazgeç</DialogClose>
        {accounts.length > 0 ? (
          <>
            <Button type="submit" form="create-publish-form" variant="secondary" disabled={pending} className="min-h-tap md:min-h-0">
              Taslak kaydet
            </Button>
            {blocked ? (
              <Hint content="Uyum engeli var: açıklamayı düzeltmeden onaya gönderilemez. Taslak kaydedebilirsin." label="Onaya gönder devre dışı">
                <Button type="button" disabled className="min-h-tap md:min-h-0">
                  Onaya gönder
                </Button>
              </Hint>
            ) : (
              <Button type="button" disabled={pending} onClick={() => submit("awaiting_approval")} className="min-h-tap md:min-h-0">
                {pending ? "Kaydediliyor…" : "Onaya gönder"}
              </Button>
            )}
          </>
        ) : null}
      </DialogFooter>
    </>
  );
}

/** Yayın formu penceresi: "Yeni yayın" ve "Kopyala ve düzelt / Yeniden dene" AYNI formdur (biri boş, biri işin değerleriyle dolu açılır). */
export function PublishFormDialog({ open, onOpenChange, ...rest }: PublishFormDialogProps) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <PublishFormBody {...rest} pending={pending} startTransition={startTransition} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
