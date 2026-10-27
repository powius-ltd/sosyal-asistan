import { pickCurrentPlan } from "@/components/notifications/digest-plan";
import { WeeklyDigestView } from "@/components/notifications/weekly-digest-view";
import { getPanelContext } from "@/lib/data";

/** Bu kadar son plan okunur; bu haftanınkini bulmaya yeter (plan listesi özet satırlarıdır, fikir yüklemez). */
const RECENT_PLANS = 8;

/**
 * "Haftalık özet" sekmesi: özeti (`now`dan geriye 7 gün; `now` tek saat), gönderim ayarlarını ve bu haftanın planını
 * (varsa; özette plana bağlantı) okur.
 */
export async function WeeklyDigestTab({ timeZone }: { timeZone: string }) {
  const { repo, wsId, now } = await getPanelContext();
  const [digest, settings, plans] = await Promise.all([
    repo.getWeeklyDigest(wsId, now),
    repo.getAlertSettings(wsId),
    repo.listWeeklyPlans(wsId, { limit: RECENT_PLANS }),
  ]);
  return (
    <WeeklyDigestView digest={digest} settings={settings} timeZone={timeZone} plan={pickCurrentPlan(plans, now, timeZone)} />
  );
}
