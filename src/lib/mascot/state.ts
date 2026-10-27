/**
 * Demirkazık'ın (Maskot) dört durumu ve ekranın durumundan türetilmesi. Saf; görsel `components/mascot/demirkazik.tsx`'te.
 * Durum kodla türer, metinle değil: sıra sende = kuyrukta karar var · düşünüyor = etkin iş var · anlatıyor = söyleyecek şeyi var ·
 * bekliyor = söyleyecek / senden isteyecek bir şey yok.
 */
export const MASCOT_STATES = ["waiting", "thinking", "telling", "turn"] as const;
export type MascotState = (typeof MASCOT_STATES)[number];

/** Ekran okuyucu etiketi (görsel bir ad taşımaz; durumu söyler). */
export const MASCOT_STATE_LABEL: Record<MascotState, string> = {
  waiting: "bekliyor",
  thinking: "düşünüyor",
  telling: "anlatıyor",
  turn: "sıra sende",
};

interface MascotInput {
  /** Karar kuyruğundaki kart sayısı. */
  decisions: number;
  /** Çalışma alanında çalışan ya da sırada bekleyen bir iş var (yalnız yönetici modunda bilinir; bilinmiyorsa false). */
  busy: boolean;
}

/**
 * Üstteki söz satırının Demirkazık'ı: iş sürüyorsa düşünüyor; kuyrukta karar varsa anlatıyor (karar bloğundaki "sıra sende" ayrıdır);
 * yoksa bekliyor.
 */
export function voiceMascotState({ decisions, busy }: MascotInput): MascotState {
  if (busy) return "thinking";
  return decisions > 0 ? "telling" : "waiting";
}

interface DockMascotInput {
  /** Sohbette yanıt hazırlanıyor (pencere kapalıyken de sürer). */
  pending: boolean;
  /** Pencere kapalıyken yeni bir yanıt geldi, henüz açılıp görülmedi. */
  unseen: boolean;
  /** Karar kuyruğundaki kart sayısı (Bugün'le aynı sayı); okunamadıysa `undefined`. */
  decisions: number | undefined;
}

/**
 * Yüzen sohbet düğmesinin Demirkazık'ı. Öncelik: düşünüyor (yanıt hazırlanıyor) > anlatıyor (yeni yanıt var) > sıra sende (kuyrukta karar
 * var, sarı nokta) > bekliyor. Sarı nokta yalnız "sıra sende" anlamında kalır; karar sayısı bilinmiyorsa (`undefined`) nokta çıkmaz.
 */
export function dockMascotState({ pending, unseen, decisions }: DockMascotInput): MascotState {
  if (pending) return "thinking";
  if (unseen) return "telling";
  return decisions !== undefined && decisions > 0 ? "turn" : "waiting";
}
