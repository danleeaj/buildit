# Reliable Project Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make authenticated project loading and version saving reliable, visible, retryable, account-scoped, and runnable through the real API in local development.

**Architecture:** Keep Neon Auth, Vercel functions, and Postgres as the persistence stack. Extract project orchestration into a pure observable controller wrapped by a small React hook, then render account, save, and project-list states through focused components while `App.jsx` remains responsible for the generation workflow.

**Tech Stack:** React 18, Vite 6, Bun test, Neon Auth, Neon serverless Postgres, Vercel Functions, JOSE.

## Global Constraints

- Browser-local project migration and restoration are out of scope.
- `/api/projects` remains the only authenticated project persistence boundary.
- Save operations must be serialized and retry the newest unsaved snapshot.
- Account-scoped client state must reset whenever the authenticated user changes or signs out.
- No new production dependencies.
- Use `bun` for dependency installation.
- All existing tests and `bun run build` must pass.

---

## File Structure

- `src/lib/projectPersistence.js`: framework-independent project state machine, queue, retry, and API orchestration.
- `src/lib/projectPersistence.test.js`: deterministic controller tests with a fake request function.
- `src/hooks/useProjectPersistence.js`: React subscription and user-lifecycle wrapper for the controller.
- `src/components/AccountControl.jsx`: signed-in identity and sign-out action.
- `src/components/SaveStatus.jsx`: persistence state and retry action.
- `src/components/ProjectsPlaceholder.jsx`: loading, empty, populated, and retryable error rendering.
- `src/lib/apiClient.js`: bearer-token forwarding and stable API error categories.
- `src/lib/apiClient.test.js`: request and error normalization tests.
- `src/components/AuthGate.jsx`: authenticated sign-out callback wiring.
- `src/App.jsx`: consumes the hook and renders the focused components.
- `api/_lib/auth.js`: distinguish missing server authentication configuration from invalid credentials.
- `api/_lib/auth.test.js`: backend authentication error tests.
- `src/styles.css`: account, save-state, and project-state presentation.
- `package.json`, `bun.lock`, `README.md`, `.env.example`: local Vercel runtime and configuration guidance.
- `src/lib/generatedApp.js`: narrowly restore the parser contract required by the pre-existing failing test.

### Task 1: Stabilize Authentication and API Errors

**Files:**
- Create: `src/lib/apiClient.test.js`
- Create: `api/_lib/auth.test.js`
- Modify: `src/lib/apiClient.js`
- Modify: `api/_lib/auth.js`

**Interfaces:**
- Produces: `ApiClientError(message, status, code)` with `status` and `code` fields.
- Produces: `apiRequest(path, options, dependencies?)`, where optional test dependencies can supply `getToken` and `fetchImpl`.
- Produces: backend errors with `status` and safe `code` values `auth_configuration` or `unauthorized`.

- [ ] **Step 1: Write failing client error tests**

```js
import { expect, test } from "bun:test";
import { ApiClientError, apiRequest } from "./apiClient.js";

test("apiRequest forwards the bearer token", async () => {
  let headers;
  await apiRequest("/api/projects", {}, {
    getToken: async () => "jwt-token",
    fetchImpl: async (_path, options) => {
      headers = options.headers;
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    },
  });
  expect(headers.Authorization).toBe("Bearer jwt-token");
});

test("apiRequest normalizes an expired session", async () => {
  const request = apiRequest("/api/projects", {}, {
    getToken: async () => "expired",
    fetchImpl: async () => new Response(JSON.stringify({ error: "Sign in is required.", code: "unauthorized" }), { status: 401 }),
  });
  await expect(request).rejects.toMatchObject({ status: 401, code: "unauthorized" });
});

test("apiRequest categorizes a network failure", async () => {
  const request = apiRequest("/api/projects", {}, {
    getToken: async () => "jwt-token",
    fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
  });
  await expect(request).rejects.toEqual(new ApiClientError("Could not reach project storage.", 0, "network"));
});
```

- [ ] **Step 2: Run the client tests and verify they fail**

Run: `bun test src/lib/apiClient.test.js`

Expected: FAIL because dependency injection and `code` do not exist.

- [ ] **Step 3: Implement client error normalization**

```js
export class ApiClientError extends Error {
  constructor(message, status = 0, code = "request_failed") {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(path, { method = "GET", body } = {}, dependencies = {}) {
  const getToken = dependencies.getToken || getAccessToken;
  const fetchImpl = dependencies.fetchImpl || fetch;
  const token = await getToken();
  let response;
  try {
    response = await fetchImpl(path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiClientError("Could not reach project storage.", 0, "network");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiClientError(payload.error || "Request failed.", response.status, payload.code || "request_failed");
  }
  return payload;
}
```

- [ ] **Step 4: Write backend authentication tests**

```js
import { afterEach, expect, test } from "bun:test";
import { requireUser } from "./auth.js";

const originalJwks = process.env.NEON_AUTH_JWKS_URL;
afterEach(() => {
  if (originalJwks === undefined) delete process.env.NEON_AUTH_JWKS_URL;
  else process.env.NEON_AUTH_JWKS_URL = originalJwks;
});

test("missing JWKS configuration is a server configuration error", async () => {
  delete process.env.NEON_AUTH_JWKS_URL;
  await expect(requireUser({ headers: { authorization: "Bearer token" } })).rejects.toMatchObject({
    status: 503,
    code: "auth_configuration",
  });
});

test("missing bearer credentials are unauthorized", async () => {
  await expect(requireUser({ headers: {} })).rejects.toMatchObject({ status: 401, code: "unauthorized" });
});
```

- [ ] **Step 5: Implement safe backend error categories and return codes**

```js
function apiError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

function keySet() {
  if (jwks) return jwks;
  const url = process.env.NEON_AUTH_JWKS_URL;
  if (!url) throw apiError("Project authentication is not configured.", 503, "auth_configuration");
  jwks = createRemoteJWKSet(new URL(url));
  return jwks;
}

export async function requireUser(req) {
  const match = (req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) throw apiError("Sign in is required.", 401, "unauthorized");
  const configuredKeys = keySet();
  try {
    const { payload } = await jwtVerify(match[1], configuredKeys);
    if (typeof payload.sub !== "string" || !payload.sub) throw new Error("Missing subject");
    return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : "" };
  } catch {
    throw apiError("Your session expired. Sign in again.", 401, "unauthorized");
  }
}
```

Update `fail()` or the project handlers so JSON errors include `code: error.code` when present.

- [ ] **Step 6: Run focused tests and commit**

Run: `bun test src/lib/apiClient.test.js api/_lib/auth.test.js`

Expected: all tests PASS.

Commit: `git commit -am "fix: clarify project authentication failures"` after staging the two new tests.

### Task 2: Build the Serialized Project Persistence Controller

**Files:**
- Create: `src/lib/projectPersistence.js`
- Create: `src/lib/projectPersistence.test.js`

**Interfaces:**
- Produces: `createProjectPersistence({ request })`.
- Controller methods: `subscribe(listener)`, `getState()`, `setUser(userId)`, `loadProjects()`, `openProject(projectId)`, `save(payload)`, `retry()`, `dispose()`.
- State: `{ userId, projects, listStatus, listError, activeProjectId, saveStatus, saveError }`.

- [ ] **Step 1: Write failing controller lifecycle tests**

```js
import { expect, test } from "bun:test";
import { createProjectPersistence } from "./projectPersistence.js";

const payload = (html) => ({ title: "App", problem: "Problem", html, config: {}, conversation: [] });

test("loads projects and clears account state when the user changes", async () => {
  const controller = createProjectPersistence({ request: async () => ({ projects: [{ id: "one" }] }) });
  await controller.setUser("user-a");
  expect(controller.getState().projects).toEqual([{ id: "one" }]);
  await controller.setUser(null);
  expect(controller.getState()).toMatchObject({ projects: [], activeProjectId: null, listStatus: "idle", saveStatus: "idle" });
});

test("serializes creation and a newer queued version", async () => {
  const calls = [];
  let releaseCreate;
  const request = (path, options = {}) => {
    calls.push({ path, options });
    if (path === "/api/projects" && options.method === "POST") {
      return new Promise((resolve) => { releaseCreate = () => resolve({ project: { id: "project-1" } }); });
    }
    if (path.endsWith("/versions")) return Promise.resolve({ version: { id: "version-2" } });
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
});

test("retry saves the newest failed payload", async () => {
  let fail = true;
  const posted = [];
  const controller = createProjectPersistence({ request: async (path, options = {}) => {
    if (options.method === "POST") {
      posted.push(options.body.html);
      if (fail) throw new Error("offline");
      return { project: { id: "project-1" } };
    }
    return { projects: [] };
  } });
  await controller.setUser("user-a");
  await controller.save(payload("first"));
  await controller.save(payload("latest"));
  fail = false;
  await controller.retry();
  expect(posted.at(-1)).toBe("latest");
  expect(controller.getState().saveStatus).toBe("saved");
});
```

- [ ] **Step 2: Run controller tests and verify they fail**

Run: `bun test src/lib/projectPersistence.test.js`

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Implement the observable state machine and single-worker queue**

Implement `createProjectPersistence` with one mutable state object, a listener set, `pendingPayload`, `failedPayload`, and a single `workerPromise`. `save(payload)` replaces `pendingPayload`; the worker creates `/api/projects` when no active ID exists and otherwise posts `/api/projects/:id/versions`. On failure it moves the newest pending or current payload to `failedPayload`, sets `saveStatus: "error"`, and stops. On success it continues if a newer payload is queued, then refreshes the list and sets `saveStatus: "saved"`.

```js
const INITIAL_STATE = Object.freeze({
  userId: null,
  projects: [],
  listStatus: "idle",
  listError: "",
  activeProjectId: null,
  saveStatus: "idle",
  saveError: "",
});

export function createProjectPersistence({ request }) {
  let state = { ...INITIAL_STATE };
  let pendingPayload = null;
  let failedPayload = null;
  let workerPromise = null;
  let epoch = 0;
  const listeners = new Set();
  const publish = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  async function loadProjects() {
    if (!state.userId) return;
    const requestEpoch = epoch;
    publish({ listStatus: "loading", listError: "" });
    try {
      const { projects } = await request("/api/projects");
      if (requestEpoch !== epoch) return;
      publish({ projects, listStatus: "ready", listError: "" });
    } catch (error) {
      if (requestEpoch !== epoch) return;
      publish({ listStatus: "error", listError: error.message });
    }
  }

  async function setUser(userId) {
    epoch += 1;
    pendingPayload = null;
    failedPayload = null;
    workerPromise = null;
    state = { ...INITIAL_STATE, userId: userId || null };
    listeners.forEach((listener) => listener());
    if (userId) await loadProjects();
  }

  async function runWorker(runEpoch) {
    while (pendingPayload && runEpoch === epoch) {
      const current = pendingPayload;
      pendingPayload = null;
      failedPayload = current;
      publish({ saveStatus: "saving", saveError: "" });
      try {
        if (state.activeProjectId) {
          await request(`/api/projects/${state.activeProjectId}/versions`, { method: "POST", body: current });
        } else {
          const { project } = await request("/api/projects", { method: "POST", body: current });
          if (runEpoch !== epoch) return;
          publish({ activeProjectId: project.id });
        }
        failedPayload = null;
      } catch (error) {
        failedPayload = pendingPayload || current;
        pendingPayload = null;
        if (runEpoch === epoch) publish({ saveStatus: "error", saveError: error.message });
        return;
      }
    }
    if (runEpoch !== epoch) return;
    publish({ saveStatus: "saved", saveError: "" });
    await loadProjects();
  }

  function save(payload) {
    if (!state.userId) return Promise.resolve();
    pendingPayload = payload;
    failedPayload = payload;
    if (!workerPromise) {
      const runEpoch = epoch;
      workerPromise = runWorker(runEpoch).finally(() => { workerPromise = null; });
    }
    return workerPromise;
  }

  function retry() {
    return failedPayload ? save(failedPayload) : Promise.resolve();
  }

  async function openProject(projectId) {
    try {
      const { project } = await request(`/api/projects/${projectId}`);
      publish({ activeProjectId: project.id, listError: "" });
      return project;
    } catch (error) {
      publish({ listStatus: "error", listError: error.message });
      throw error;
    }
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getState() { return state; },
    setUser,
    loadProjects,
    openProject,
    save,
    retry,
    dispose() { listeners.clear(); },
  };
}
```

- [ ] **Step 4: Run controller and existing project-store tests**

Run: `bun test src/lib/projectPersistence.test.js api/_lib/projects.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

Commit: `git add src/lib/projectPersistence.js src/lib/projectPersistence.test.js && git commit -m "feat: serialize project persistence"`.

### Task 3: Add the React Hook and Focused Account/Persistence UI

**Files:**
- Create: `src/hooks/useProjectPersistence.js`
- Create: `src/components/AccountControl.jsx`
- Create: `src/components/SaveStatus.jsx`
- Modify: `src/components/ProjectsPlaceholder.jsx`
- Modify: `src/components/AuthGate.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `useProjectPersistence(userId)` returning controller state plus controller actions.
- Produces: `AccountControl({ user, onSignOut })`.
- Produces: `SaveStatus({ status, error, onRetry })`.
- Extends: `ProjectsPlaceholder({ listStatus, error, onRetry, ...existingProps })`.

- [ ] **Step 1: Implement the hook with one controller instance**

```js
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { apiRequest } from "../lib/apiClient.js";
import { createProjectPersistence } from "../lib/projectPersistence.js";

export default function useProjectPersistence(userId) {
  const controller = useMemo(() => createProjectPersistence({ request: apiRequest }), []);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useEffect(() => { void controller.setUser(userId || null); }, [controller, userId]);
  useEffect(() => () => controller.dispose(), [controller]);
  return { ...state, loadProjects: controller.loadProjects, openProject: controller.openProject, saveProject: controller.save, retrySave: controller.retry };
}
```

- [ ] **Step 2: Implement account and save-status components**

```jsx
export default function AccountControl({ user, onSignOut }) {
  const identity = user?.name?.trim() || user?.email || "Signed in";
  return <div className="account-control"><span title={user?.email || identity}>{identity}</span><button type="button" onClick={onSignOut}>Sign out</button></div>;
}
```

```jsx
export default function SaveStatus({ status, error, onRetry }) {
  if (status === "idle") return null;
  if (status === "saving") return <p className="save-status is-saving" role="status">Saving…</p>;
  if (status === "saved") return <p className="save-status is-saved" role="status">Saved</p>;
  return <div className="save-status is-error" role="alert"><span title={error || "The latest version is not saved."}>Not saved</span><button type="button" onClick={onRetry}>Retry</button></div>;
}
```

- [ ] **Step 3: Render explicit project-list states**

Add `listStatus` and `onRetry` props. Render `Loading projects…` for `loading`, the retryable error only for `error`, the empty card only for `ready && projects.length === 0`, and the project buttons for `ready`.

```jsx
{listStatus === "loading" && <p className="projects-state" role="status">Loading projects…</p>}
{listStatus === "error" && <div className="projects-state"><p className="inline-error" role="alert">{error}</p><button type="button" className="text-action" onClick={onRetry}>Retry</button></div>}
{listStatus === "ready" && projects.length === 0 && <article className="project-placeholder-card"><p className="project-card-label">No saved projects yet</p><h2>Your next useful thing</h2><p>Projects you create will appear here.</p></article>}
```

- [ ] **Step 4: Wire sign-out and add styles**

Pass `onSignOut={() => authClient.signOut()}` from `AuthGate` through a render prop or directly let the authenticated shell render `AccountControl`. Add restrained styles using existing variables for `.account-control`, `.save-status`, `.projects-state`, and their buttons; preserve mobile safe-area layout.

- [ ] **Step 5: Build and commit**

Run: `bun run build`

Expected: Vite build succeeds.

Commit: stage the hook, components, and CSS, then `git commit -m "feat: show account and project save state"`.

### Task 4: Integrate Reliable Persistence Into the App Workflow

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/AuthGate.jsx`
- Modify: `src/lib/workflow.test.js`

**Interfaces:**
- Consumes: `useProjectPersistence(user?.id)` and its methods from Task 3.
- Consumes: `AccountControl` and `SaveStatus`.

- [ ] **Step 1: Extend the workflow restoration assertion**

Add to the existing `PROJECT_LOADED` test:

```js
expect(loaded.problem).toBe(project.problem);
expect(loaded.html).toBe(project.html);
expect(loaded.projectSnapshot).toEqual(project.config);
expect(loaded.activity).toEqual(project.conversation);
```

- [ ] **Step 2: Replace local project state and effects with the hook**

Remove `projects`, `projectsError`, `activeProjectId`, the project-list `useEffect`, and `persistProject`. Consume:

```js
const persistence = useProjectPersistence(demoMode ? null : user?.id);
```

Build persistence payloads with a pure local helper and call `void persistence.saveProject(payload)` after generation and validated edits. Continue rendering the working app immediately.

- [ ] **Step 3: Wire project open, retry, account, and save state**

```js
async function openProject(projectId) {
  try {
    const project = await persistence.openProject(projectId);
    setProjectsOpen(false);
    dispatch({ type: "PROJECT_LOADED", project });
  } catch (error) {
    // Controller/API error appears in the Projects screen without discarding workflow state.
  }
}
```

Pass list state and retry into `ProjectsPlaceholder`, render `SaveStatus` near the ready-project heading, render `AccountControl` in the brand header for authenticated non-demo sessions, and use `persistence.activeProjectId` for sharing.

- [ ] **Step 4: Verify focused and full tests**

Run: `bun test src/lib/workflow.test.js src/lib/projectPersistence.test.js`

Expected: all focused tests PASS.

Run: `bun test`

Expected: all tests pass except the known parser-contract baseline until Task 5.

- [ ] **Step 5: Commit**

Commit: `git add src/App.jsx src/components/AuthGate.jsx src/lib/workflow.test.js && git commit -m "feat: integrate reliable project saving"`.

### Task 5: Make Local Persistence Runnable and Restore a Clean Baseline

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `src/lib/generatedApp.js`

**Interfaces:**
- Produces: `bun run dev:full` for the Vercel-backed full stack.
- Produces: `bun run dev` for UI-only Vite development; Vercel invokes this underlying command.

- [ ] **Step 1: Add the development-only Vercel runtime with Bun**

Run: `bun add --dev vercel`

Expected: `package.json` and `bun.lock` add `vercel` only under `devDependencies`.

- [ ] **Step 2: Define full-stack and UI-only development commands**

```json
{
  "scripts": {
    "dev": "vite --host --port ${PORT:-5173}",
    "dev:full": "vercel dev",
    "build": "vite build"
  }
}
```

- [ ] **Step 3: Document exact environment and runtime setup**

Update `.env.example` comments and README instructions to state that authenticated persistence requires non-empty `DATABASE_URL`, `VITE_NEON_AUTH_URL`, and `NEON_AUTH_JWKS_URL`; Neon allowed origins must include the local Vercel URL and deployed origin; `bun run dev:vite` cannot exercise `/api/projects`.

- [ ] **Step 4: Fix the known generated-app parser contract**

The parser test requires rejecting prose outside the single fenced `html:app` block. Ensure the matching expression anchors the complete trimmed response:

```js
const exactBlock = /^```html:app\s*\n([\s\S]*?)\n```$/;
const match = response.trim().match(exactBlock);
```

Preserve the existing byte limit and validation behavior.

- [ ] **Step 5: Run all verification**

Run: `bun test`

Expected: every test passes.

Run: `bun run build`

Expected: production Vite build succeeds with no errors.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Commit**

Commit: `git add package.json bun.lock .env.example README.md src/lib/generatedApp.js && git commit -m "chore: run project APIs in local development"`.

### Task 6: Final Persistence Audit

**Files:**
- Modify only files implicated by audit findings.

**Interfaces:**
- Verifies every acceptance criterion in the design spec.

- [ ] **Step 1: Review configuration without printing secret values**

Run: `awk -F= '/^(DATABASE_URL|VITE_NEON_AUTH_URL|NEON_AUTH_JWKS_URL)=/{ print $1, length(substr($0,index($0,"=")+1)) ? "set" : "empty" }' .env`

Expected: all three variable names report `set`; if JWKS remains missing, report the external configuration action without exposing values.

- [ ] **Step 2: Run the final automated checks**

Run: `bun test && bun run build && git diff --check`

Expected: all commands succeed.

- [ ] **Step 3: Inspect the final diff and status**

Run: `git diff --stat HEAD~5..HEAD && git status --short`

Expected: only persistence, account UI, runtime documentation, tests, and the narrow parser correction are present; the worktree is clean after commits.

- [ ] **Step 4: Record any external deployment requirement**

If Vercel lacks `NEON_AUTH_JWKS_URL`, include that exact variable name in the handoff. Do not claim deployed persistence works until the deployment environment contains it and the migration has run.
