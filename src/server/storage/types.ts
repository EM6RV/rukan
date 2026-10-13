export type StoredObject = { data: Buffer | null; objectKey: string | null };

export interface StorageAdapter {
  readonly driver: "turso" | "r2";
  /** يحفظ الملف. turso يرجع data ليتخزن في صف القاعدة، r2 يرفع ويرجع المفتاح. */
  put(input: { id: string; buffer: Buffer; mime: string }): Promise<StoredObject>;
  /** يقرا الملف. */
  get(row: { id: string; data: Buffer | null; objectKey: string | null }): Promise<Buffer | null>;
  delete(row: { objectKey: string | null }): Promise<void>;
}
