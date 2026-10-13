import { getEnv } from "@/lib/env";
import { r2Storage } from "./r2";
import { tursoStorage } from "./turso";
import type { StorageAdapter } from "./types";

export type { StorageAdapter } from "./types";

export const adapters = { turso: tursoStorage, r2: r2Storage } as const;

/** الـ adapter الافتراضي من STORAGE_DRIVER. */
export const getStorage = (): StorageAdapter => adapters[getEnv().STORAGE_DRIVER];
