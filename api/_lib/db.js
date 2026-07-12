import { neon } from "@neondatabase/serverless";

let sql;

export function database() {
  if (sql) return sql;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  sql = neon(process.env.DATABASE_URL);
  return sql;
}
