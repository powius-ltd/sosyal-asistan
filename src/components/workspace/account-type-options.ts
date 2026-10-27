import type { SelectOption } from "@/components/common/labeled-select";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_PROFILE } from "@/lib/domain/account-type";

/** Hesap türü seçenekleri (ayar alanı ve çalışma alanı oluşturma formu ortak kullanır); etiketler `domain/account-type.ts` tablosundan. */
export const ACCOUNT_TYPE_OPTIONS: SelectOption[] = ACCOUNT_TYPES.map((value) => ({ value, label: ACCOUNT_TYPE_PROFILE[value].label }));
