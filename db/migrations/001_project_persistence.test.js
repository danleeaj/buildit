import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

test("project persistence migration defines the ownership and sharing contract", async () => {
  const migration = await readFile(
    new URL("./001_project_persistence.sql", import.meta.url),
    "utf8",
  );

  expect(migration).toContain("create table if not exists projects");
  expect(migration).toContain("owner_id text not null");
  expect(migration).toContain("create table if not exists project_versions");
  expect(migration).toContain("unique (project_id, version_number)");
  expect(migration).toContain("create table if not exists share_links");
  expect(migration).toContain("token text not null unique");
  expect(migration).toContain("is_demo boolean not null default false");
});
