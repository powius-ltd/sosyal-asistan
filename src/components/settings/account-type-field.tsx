"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateAccountType } from "@/app/actions/account-type-settings";
import { callAction } from "@/components/common/call-action";
import { LabeledSelect } from "@/components/common/labeled-select";
import { TAP_TARGET } from "@/components/notifications/tap";
import { accountTypeEffects } from "@/components/settings/account-type-effects";
import { ACCOUNT_TYPE_OPTIONS } from "@/components/workspace/account-type-options";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACCOUNT_TYPE_PROFILE, isAccountType, type AccountType } from "@/lib/domain/account-type";
import { formatPercent } from "@/lib/format";
import { ACCOUNT_TYPE_CONFIRM_PLAIN, accountTypeEffectPlain } from "@/lib/plain-language-account";

export interface AccountTypeFieldProps {
  /** `workspace.accountType` (kayıtlı değer). */
  accountType: AccountType;
  /** Yönetici görünümü: sonuç satırı teknik dilde (matris adları); müşteri düz dil okur. */
  operator?: boolean;
}

const percent = (n: number): string => formatPercent(n, 0) ?? "";

/** Seçeneğin sonucu, müşteri dilinde satırlar (onay penceresi ve müşteri görünümündeki açıklama ortak kullanır). */
const effectLines = (type: AccountType): string[] => accountTypeEffectPlain(ACCOUNT_TYPE_PROFILE[type], percent);

/** İki türün harita listesi farklı mı? (Farklıysa Kreatif anatomisi başka ekrana döner; onay penceresi bunu söyler.) */
const mapsDiffer = (a: AccountType, b: AccountType): boolean => ACCOUNT_TYPE_PROFILE[a].matrices.join() !== ACCOUNT_TYPE_PROFILE[b].matrices.join();

/**
 * Ayarlar, "Hesap türü": hesabın amacı. İşletme / koç güven → müşteri → satış (açı × farkındalık matrisi); içerik üreticisi erişim ve takipçi
 * (konu × hook türü matrisi, açı etiketlemesi yok); karma ikisi birden. Tür değişimi plan ve analizi değiştirdiğinden ANINDA kaydedilmez:
 * "Türü kaydet" önce "Bundan sonra plan ve analiz şöyle değişir" penceresini açar, onayla kaydedilir (D3-18). Kayıt sunucuda doğrulanır.
 */
export function AccountTypeField({ accountType, operator = false }: AccountTypeFieldProps) {
  const [value, setValue] = useState<string>(accountType);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = value !== accountType;
  const selected = isAccountType(value) ? value : accountType;

  function save() {
    if (!isAccountType(value)) return;
    startTransition(async () => {
      const result = await callAction(() => updateAccountType({ accountType: value }), "Hesap türü kaydedilemedi. Tekrar dene.");
      if (result.ok) {
        toast.success("Hesap türü kaydedildi.");
        setConfirmOpen(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="account-type-field">
      <div className="flex flex-wrap items-end gap-2">
        <LabeledSelect label="Hesap türü" value={value} options={ACCOUNT_TYPE_OPTIONS} onChange={setValue} disabled={pending} className="w-64 min-h-tap md:min-h-0" />
        <Button type="button" variant="secondary" disabled={!dirty || pending} onClick={() => setConfirmOpen(true)} className={TAP_TARGET}>
          {pending ? "Kaydediliyor…" : "Türü kaydet"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{ACCOUNT_TYPE_PROFILE[selected].description}</p>
      <p className="text-xs text-muted-foreground" data-testid="account-type-effects">
        {operator ? accountTypeEffects(ACCOUNT_TYPE_PROFILE[selected]) : effectLines(selected).join(" ")}
      </p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ACCOUNT_TYPE_CONFIRM_PLAIN.title}</DialogTitle>
            <DialogDescription>{ACCOUNT_TYPE_CONFIRM_PLAIN.lead(ACCOUNT_TYPE_PROFILE[accountType].label, ACCOUNT_TYPE_PROFILE[selected].label)}</DialogDescription>
          </DialogHeader>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm" data-testid="account-type-confirm-effects">
            {effectLines(selected).map((line) => (
              <li key={line}>{line}</li>
            ))}
            {mapsDiffer(accountType, selected) ? <li>{ACCOUNT_TYPE_CONFIRM_PLAIN.screenNote}</li> : null}
          </ul>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" className={TAP_TARGET} />}>{ACCOUNT_TYPE_CONFIRM_PLAIN.cancel}</DialogClose>
            <Button type="button" disabled={pending} onClick={save} className={TAP_TARGET}>
              {pending ? "Kaydediliyor…" : ACCOUNT_TYPE_CONFIRM_PLAIN.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
