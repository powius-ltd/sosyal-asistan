import { NotFoundView } from "@/app/not-found-view";
import { ROUTES } from "@/lib/routes";

export default function VideoNotFound() {
  return (
    <NotFoundView
      title="Bu video bulunamadı"
      description="Bağlantı eski olabilir ya da video listeden kalkmış olabilir. İçeriklerinden güncel listeye bakabilirsin."
      secondary={{ href: ROUTES.content, label: "İçeriklerim" }}
    />
  );
}
