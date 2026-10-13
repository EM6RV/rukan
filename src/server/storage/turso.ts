import type { StorageAdapter } from "./types";

// تخزين الصور داخل القاعدة نفسها (عمود blob). مناسب للبداية وبدون خدمات إضافية.
export const tursoStorage: StorageAdapter = {
  driver: "turso",
  async put({ buffer }) {
    return { data: buffer, objectKey: null };
  },
  async get(row) {
    return row.data;
  },
  async delete() {
    // الصف نفسه يتمسح من جدول media، ما فيه شي زيادة نمسحه
  },
};
