/** رابط صورة من /api/media مع عرض اختياري (يتصغر على السيرفر ويتكاش). العروض المسموحة: 160/320/640/960/1280 */
export const MEDIA_WIDTHS = [160, 320, 640, 960, 1280] as const;
export const mediaUrl = (id: string, width?: number) => `/api/media/${id}${width ? `?w=${width}` : ""}`;

export function mediaSrcSet(id: string, widths: readonly number[] = [320, 640, 960]) {
  return widths.map((w) => `${mediaUrl(id, w)} ${w}w`).join(", ");
}
