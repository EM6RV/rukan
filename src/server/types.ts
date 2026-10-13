import type { InferSelectModel } from "drizzle-orm";
import type { stores } from "@/db/schema/platform";

export type Store = InferSelectModel<typeof stores>;
