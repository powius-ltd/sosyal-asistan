import { PUBLISH_FIELD_ID, type PublishField } from "@/components/publish/publish-messages";

/** Alanın altındaki kırmızı hata cümlesi; alan `aria-describedby="<alan>-error"` ile bağlanır (D2-09). Mesaj yoksa hiçbir şey çizmez. */
export function PublishFieldError({ field, message }: { field: PublishField; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={`${PUBLISH_FIELD_ID[field]}-error`} className="text-xs font-medium text-destructive" role="alert">
      {message}
    </p>
  );
}
