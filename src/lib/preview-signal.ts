// إشارة بسيطة بين نماذج الحفظ ومعاينة المتجر: بعد كل حفظ ناجح تتحدث المعاينة
export const STORE_SAVED_EVENT = "rukn:store-saved";
export const notifyStoreSaved = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STORE_SAVED_EVENT));
};
