/** Stüdyo videosu yolu öneki (SAF; dosya sistemine dokunmaz, bileşenler de kullanabilir). Çözümleme ve kök denetimi `order-media.ts`'tedir. */
export const ORDER_MEDIA_PREFIX = "siparis:";

export const isOrderMediaPath = (value: string | undefined): value is string => value !== undefined && value.startsWith(ORDER_MEDIA_PREFIX);
