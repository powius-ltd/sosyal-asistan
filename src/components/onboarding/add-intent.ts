import { ROUTES } from "@/lib/routes";

/**
 * "Başka bir hesap ekle" NİYETİ (adım değil): akışın adımı her zaman veriden türer, ama kurulu (ya da akışı süren) bir hesaptayken
 * kullanıcı yeni hesap eklemek isteyebilir (hesap seçicideki "Hesap ekle"). `/baslangic?ekle=1` hesap ekleme formunu açar; parametre
 * hangi adımda olunduğunu TAŞIMAZ ve hesap eklenince adresten düşer.
 */
export const ONBOARDING_ADD_PARAM = "ekle";

export const ONBOARDING_ADD_HREF = `${ROUTES.onboarding}?${ONBOARDING_ADD_PARAM}=1`;
