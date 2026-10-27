/**
 * İş başlatma kapısı — TEK yerde: iş başlatan / durduran / işçiyi dürten her action bunu ister (plan §2 "Operatör kapısı").
 * Açık = bu ortamda iş başlatılabilir (`jobsAvailability`) VE yönetici modu açık (`isOperatorMode`). Action doğrudan POST edilebildiği için
 * kapı sunucuda, her çağrıda denetlenir; kapalıyken action `invalid_state` döner ve depoya / işçiye hiç dokunmaz.
 * Durum ucu (`GET /api/isler`) kapıya bağlı DEĞİLDİR: durum şeridini herkes görür.
 */
import "server-only";

import { jobsAvailability, type JobsAvailabilityDeps, type JobsUnavailableReason } from "@/lib/job-control/availability";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

/** `operator_off`: ortam uygun ama yönetici modu kapalı (müşteri görünümü). Diğerleri `JobsUnavailableReason`. */
export type JobsGateClosedReason = JobsUnavailableReason | "operator_off";

export type JobsGate = { open: true } | { open: false; reason: JobsGateClosedReason };

export function jobsGate(deps: JobsAvailabilityDeps = {}): JobsGate {
  const availability = jobsAvailability(deps);
  if (!availability.available) return { open: false, reason: availability.reason };
  return isOperatorMode(deps.env ?? process.env) ? { open: true } : { open: false, reason: "operator_off" };
}
