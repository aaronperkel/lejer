// Applies db/migrations/*.sql in filename order as the owner role, once each, recording them
// in schema_migrations. `npm run migrate -- --seed` then (re)loads db/seed.sql, which resets
// only the two seed households.
import fs from "node:fs";
import path from "node:path";
import { adminSql } from "../lib/db";

const root = path.join(import.meta.dirname, "..");
const migrationsDir = path.join(root, "db", "migrations");

async function main() {
  const sql = adminSql();
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    const applied = new Set(
      (await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`).map((r) => r.filename),
    );

    const files = fs.readdirSync(migrationsDir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
      });
      console.log(`applied ${file}`);
      ran++;
    }
    console.log(ran ? `${ran} migration(s) applied` : "schema is up to date");

    if (process.argv.includes("--seed")) {
      const seed = fs.readFileSync(path.join(root, "db", "seed.sql"), "utf8");
      await sql.begin((tx) => tx.unsafe(seed));
      console.log("seeded db/seed.sql");
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
