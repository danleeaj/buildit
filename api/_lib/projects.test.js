import { expect, test } from "bun:test";
import { createProjectStore } from "./projects.js";

test("find scopes a project to its owner", async () => {
  const queries = [];
  const store = createProjectStore((parts, ...values) => {
    queries.push({ text: parts.join("?"), values });
    return [];
  });

  await store.find("owner-a", "11111111-1111-4111-8111-111111111111");
  expect(queries[0].text).toContain("owner_id");
  expect(queries[0].values).toContain("owner-a");
});

test("store exposes no demo mutation", () => {
  expect(Object.keys(createProjectStore(() => []))).not.toContain("writeDemo");
});
