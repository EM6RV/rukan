import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createDb } from "@/db";
import { STORE_TEMPLATES } from "@/lib/constants";

const MIGRATIONS = "./src/db/migrations";

describe("ترحيل القوالب القديمة للستة الجديدة (migration 0011)", () => {
  it("يحوّل كل قالب قديم لأقرب جديد وما يلمس الجديد", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rukn-tpl-"));
    const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"));
    const before = join(dir, "before");
    mkdirSync(join(before, "meta"), { recursive: true });
    const entries = journal.entries.filter((e: { tag: string }) => e.tag < "0011");
    for (const e of entries) cpSync(join(MIGRATIONS, `${e.tag}.sql`), join(before, `${e.tag}.sql`));
    writeFileSync(join(before, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));

    const { db, client } = createDb(`file:${join(dir, "t.db")}`);
    await migrate(db, { migrationsFolder: before });
    await client.execute("INSERT INTO users (id, phone, name, password_hash, created_at) VALUES ('u','0910000001','أ','x',1)");
    const old = ["simple", "elegant", "noir", "bold", "pop", "warm", "editorial", "gallery", "souq"];
    for (const t of old) await client.execute({ sql: "INSERT INTO stores (id, slug, name, owner_user_id, template, created_at, updated_at) VALUES (?,?,?,'u',?,1,1)", args: [t, `s-${t}`, t, t] });

    await migrate(db, { migrationsFolder: MIGRATIONS });
    const rows = (await client.execute("SELECT id, template FROM stores")).rows;
    const got = Object.fromEntries(rows.map((r) => [String(r.id), String(r.template)]));
    expect(got).toEqual({ simple: "naqa", elegant: "makhmal", noir: "makhmal", bold: "nabd", pop: "nabd", warm: "hikaya", editorial: "lamsa", gallery: "lamsa", souq: "souq" });
    expect(Object.values(got).every((t) => (STORE_TEMPLATES as readonly string[]).includes(t))).toBe(true);
  });
});
