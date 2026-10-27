import type { IdeaStatus } from "@/lib/domain/intel";

/** Sekme ve bildirimlerde görünen durum adları. Sıra = `IDEA_STATUSES` sırası. */
export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  new: "Yeni",
  saved: "Kaydedilen",
  scripted: "Script hazır",
  scheduled: "Planlandı",
  published: "Yayınlandı",
  dismissed: "Elenen",
};

/** Durum boşken sekmede gösterilen boş durum metni. */
export const IDEA_STATUS_EMPTY: Record<IdeaStatus, { title: string; description: string }> = {
  new: { title: "Yeni fikir yok", description: "Tutan içeriklerden fikir üretildikçe burada görünür." },
  saved: { title: "Kaydedilen fikir yok", description: "Beğendiğin bir fikri “Kaydet” ile buraya alabilirsin." },
  scripted: { title: "Script'i hazır fikir yok", description: "Script'i hazırlanan fikirler burada listelenir." },
  scheduled: { title: "Planlanan fikir yok", description: "Yayın için planlanan fikirler burada listelenir." },
  published: { title: "Yayınlanan fikir yok", description: "Yayınlanmış fikirler burada listelenir." },
  dismissed: { title: "Elenen fikir yok", description: "Elediğin fikirler burada durur; istersen yeniye alabilirsin." },
};
