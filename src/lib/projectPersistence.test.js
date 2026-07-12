import { expect, test } from "bun:test";
import { createProjectPersistence } from "./projectPersistence.js";

const payload = (html) => ({
  title: "App",
  problem: "Problem",
  html,
  config: {},
  conversation: [],
});

test("loads projects and clears account state when the user changes", async () => {
  const controller = createProjectPersistence({
    request: async () => ({ projects: [{ id: "one" }] }),
  });
  await controller.setUser("user-a");
  expect(controller.getState().projects).toEqual([{ id: "one" }]);
  await controller.setUser(null);
  expect(controller.getState()).toMatchObject({
    projects: [],
    activeProjectId: null,
    listStatus: "idle",
    saveStatus: "idle",
  });
});

test("retries a failed project-list request", async () => {
  let fail = true;
  const controller = createProjectPersistence({
    request: async () => {
      if (fail) throw Object.assign(new Error("expired"), { code: "unauthorized" });
      return { projects: [{ id: "one" }] };
    },
  });
  await controller.setUser("user-a");
  expect(controller.getState()).toMatchObject({
    listStatus: "error",
    listError: "Your session expired. Sign in again.",
  });
  fail = false;
  await controller.loadProjects();
  expect(controller.getState()).toMatchObject({
    listStatus: "ready",
    projects: [{ id: "one" }],
  });
});

test("serializes creation and a newer queued version", async () => {
  const calls = [];
  let releaseCreate;
  const request = (path, options = {}) => {
    calls.push({ path, options });
    if (path === "/api/projects" && options.method === "POST") {
      return new Promise((resolve) => {
        releaseCreate = () => resolve({ project: { id: "project-1" } });
      });
    }
    if (path.endsWith("/versions")) {
      return Promise.resolve({ version: { id: "version-2" } });
    }
    return Promise.resolve({ projects: [] });
  };
  const controller = createProjectPersistence({ request });
  await controller.setUser("user-a");
  const first = controller.save(payload("first"));
  const second = controller.save(payload("second"));
  releaseCreate();
  await Promise.all([first, second]);

  const writes = calls.filter((call) => call.options.method === "POST");
  expect(writes.map((call) => call.options.body.html)).toEqual(["first", "second"]);
  expect(writes[1].path).toBe("/api/projects/project-1/versions");
  expect(controller.getState()).toMatchObject({
    activeProjectId: "project-1",
    saveStatus: "saved",
  });
});

test("coalesces multiple queued snapshots to the newest version", async () => {
  const written = [];
  let releaseCreate;
  const controller = createProjectPersistence({
    request: (path, options = {}) => {
      if (!options.method) return Promise.resolve({ projects: [] });
      written.push(options.body.html);
      if (path === "/api/projects") {
        return new Promise((resolve) => {
          releaseCreate = () => resolve({ project: { id: "project-1" } });
        });
      }
      return Promise.resolve({ version: { id: "version" } });
    },
  });
  await controller.setUser("user-a");
  const saving = controller.save(payload("first"));
  controller.save(payload("middle"));
  controller.save(payload("latest"));
  releaseCreate();
  await saving;
  expect(written).toEqual(["first", "latest"]);
});

test("retry saves the newest failed payload", async () => {
  let fail = true;
  const posted = [];
  const controller = createProjectPersistence({
    request: async (_path, options = {}) => {
      if (options.method === "POST") {
        posted.push(options.body.html);
        if (fail) throw new Error("offline");
        return { project: { id: "project-1" } };
      }
      return { projects: [] };
    },
  });
  await controller.setUser("user-a");
  await controller.save(payload("first"));
  await controller.save(payload("latest"));
  expect(controller.getState().saveStatus).toBe("error");
  fail = false;
  await controller.retry();
  expect(posted.at(-1)).toBe("latest");
  expect(controller.getState().saveStatus).toBe("saved");
});

test("a new project clears the active project without clearing the list", async () => {
  const controller = createProjectPersistence({
    request: async (path) => path === "/api/projects"
      ? { projects: [{ id: "one" }] }
      : { project: { id: "one" } },
  });
  await controller.setUser("user-a");
  await controller.openProject("one");
  controller.startNewProject();
  expect(controller.getState()).toMatchObject({
    activeProjectId: null,
    projects: [{ id: "one" }],
    saveStatus: "idle",
  });
});
