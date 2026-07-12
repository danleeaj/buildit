import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to run migrations.");

const migrationDirectory = resolve("db/migrations");
const migrations = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const sql = neon(connectionString);
for (const migration of migrations) {
  const source = await readFile(resolve(migrationDirectory, migration), "utf8");
  const statements = source
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  await sql.transaction(statements.map((statement) => sql.query(statement)));
  console.log(migration);
}
