import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "../src/db";
import { getEnv } from "../src/lib/env";

const env = getEnv();
const { db, client } = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
await migrate(db, { migrationsFolder: "./src/db/migrations" });
console.log("تم تطبيق الـ migrations ✓");
client.close();
