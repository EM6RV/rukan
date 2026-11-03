// تخزين الكاشير المحلي (IndexedDB) بدون مكتبات: بيانات البداية، طابور العمليات (outbox)، الفواتير المعلّقة، والفواتير الأخيرة.
const DB_NAME = "rukn-pos";
const VERSION = 1;
export const STORES = ["kv", "outbox", "held", "sales"] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      if (!db.objectStoreNames.contains("held")) db.createObjectStore("held", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sales")) db.createObjectStore("sales", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

const wrap = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return wrap(fn(db.transaction(store, mode).objectStore(store)));
}

export const kvGet = <T>(key: string) => tx<T | undefined>("kv", "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const kvSet = (key: string, value: unknown) => tx("kv", "readwrite", (s) => s.put(value, key));
export const getAll = <T>(store: StoreName) => tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
export const put = (store: StoreName, value: unknown) => tx(store, "readwrite", (s) => s.put(value));
export const del = (store: StoreName, key: IDBValidKey) => tx(store, "readwrite", (s) => s.delete(key));
export const count = (store: StoreName) => tx<number>(store, "readonly", (s) => s.count());

/** يمسح أقدم الفواتير المحلية ويخلي آخر n (للبحث بالرقم والمرتجع وإعادة الطباعة) */
export async function trimSales(keep = 500) {
  const all = await getAll<{ id: string; at: number }>("sales");
  if (all.length <= keep) return;
  for (const s of all.sort((a, b) => a.at - b.at).slice(0, all.length - keep)) await del("sales", s.id);
}
