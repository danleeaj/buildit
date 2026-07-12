# Reliable Project Persistence Design

## Goal

Make authenticated project persistence dependable and visible: users can confirm which account is active, see projects owned by that account, understand whether the current project is saved, retry failed saves, and run the same project API locally that runs in production.

## Scope

This work covers authenticated project loading, creation, version saving, retry behavior, account controls, persistence status, project-list states, environment validation, local API runtime, and focused automated tests.

Browser-local project migration and restoration are explicitly out of scope. Existing `localStorage` writes may remain for the current milestone, but local snapshots will not be imported into an authenticated account or displayed in the Projects list.

## Architecture

Neon Auth remains the identity provider. Vercel functions under `/api/projects` remain the only authenticated persistence boundary, and Neon Postgres remains the source of truth for account projects and immutable versions.

Client-side project persistence will move behind a focused controller or hook instead of remaining interleaved throughout `App.jsx`. The controller owns project loading, active project identity, save serialization, latest-unsaved snapshot retention, retry, and account-state reset. `App.jsx` continues to own the app-building workflow and submits completed snapshots to the persistence controller.

The client will expose an explicit persistence state:

- `idle`: no save is currently relevant.
- `loading`: the account project list is being fetched.
- `saving`: a project or version request is in flight.
- `saved`: the latest submitted snapshot was confirmed by the server.
- `error`: the latest submitted snapshot was not confirmed and remains available for retry.

## Authentication and Account Controls

The existing Neon browser session remains responsible for gating the authenticated application. A visible account control will show the current user's name or email and provide sign-out.

Signing out must clear account-scoped client state, including the loaded project list, active project ID, pending save payload, save status, and project errors. A subsequent account must never see stale in-memory project metadata from the previous account.

API requests continue to send the Neon session JWT as a bearer token. Authentication failures will be normalized into actionable client messages. The backend will distinguish a missing JWKS configuration from an invalid or expired user token without leaking secrets.

## Project Loading

After a user session becomes available, the client loads `/api/projects`. The Projects screen represents four distinct states:

- Loading: project data has not returned yet.
- Empty: the request succeeded and returned no projects.
- Populated: owned projects are listed by most recently updated.
- Error: loading failed and the user can retry.

Opening a project fetches its complete current record and restores its HTML, problem, configuration snapshot, and conversation into the existing workflow reducer. The returned project ID becomes the active project ID for subsequent version saves.

## Save and Version Flow

When generation completes, the working app appears immediately and the controller submits a create-project request. The interface shows `Saving…` until the server confirms creation. Only the server response assigns the active database project ID.

When an edit completes, the controller submits a version request for the active project. Version rows remain immutable while the project's current HTML, configuration, conversation, title, problem, and update timestamp advance atomically.

Save operations are serialized. If a newer snapshot arrives during an in-flight save, it replaces the queued snapshot and is saved after the current request completes. This prevents duplicate project creation and avoids sending concurrent version writes with ambiguous ordering.

After success, the client refreshes or deterministically updates the project list and displays `Saved`. After failure, it displays `Not saved` with Retry. Retry always submits the latest unsaved snapshot, never an obsolete intermediate payload. A failed save does not remove or replace the working app in the browser.

## Error Handling

The API client will map failures into stable categories while preserving safe server messages:

- `401`: the session is missing or expired; prompt the user to sign in again.
- Server configuration failure: identify that project storage is not configured and name the missing server-side variable in development output.
- Network failure: explain that the app remains usable but is not saved.
- Validation or ownership failure: show the safe API response and do not retry automatically.

Project-list and save errors are separate. A list-loading failure must not overwrite a save failure, and a successful list refresh must not falsely mark an unsaved snapshot as saved.

## Local Development and Configuration

Local development must serve both the Vite application and Vercel functions so `/api/projects` behaves like production. The primary development command will use the Vercel local runtime; a Vite-only command may remain for UI-only work.

Documentation will list the required values:

- `VITE_NEON_AUTH_URL`
- `DATABASE_URL`

The server will prefer an explicit `NEON_AUTH_JWKS_URL`, then derive the
standard `/jwt` endpoint from `NEON_AUTH_BASE_URL` or `VITE_NEON_AUTH_URL`.

The development setup will fail clearly when authenticated project persistence is requested without its server-side configuration. Neon allowed origins must include the local and deployed application origins used for authentication.

No new production dependencies are required. A development-only Vercel runtime dependency may be added.

## UI Components

The implementation will add or refine focused components:

- Account control: user identity and sign-out.
- Save status: saving, saved, failure, and retry action.
- Projects screen: loading, empty, populated, failure, and retry states.

These components receive state and callbacks; they do not call the project API directly. This keeps rendering separate from persistence orchestration and makes state behavior testable.

## Testing

Tests will cover:

- Bearer-token forwarding and normalized API errors.
- Missing JWKS configuration versus invalid or expired authentication.
- Project-list loading, retry, and account-state reset.
- Project creation followed by version creation.
- Save serialization while a request is in flight.
- Latest-snapshot retry after failure.
- Persistence status transitions.
- Backend owner scoping and immutable version behavior.
- Workflow restoration when a saved project is opened.

The full `bun test` and `bun run build` checks must pass. The pre-existing generated-app parser test failure will be corrected if needed to restore a clean baseline; that correction will remain narrowly scoped to the parser's documented contract.

## Acceptance Criteria

- A signed-in user can see which account is active and can sign out.
- A successful project-list request never appears as a login failure.
- A new account receives a true empty Projects state.
- A completed build visibly progresses from saving to saved, or to a retryable not-saved state.
- Multiple rapid snapshots cannot create duplicate projects or reorder versions.
- Retrying saves the newest unsaved snapshot.
- Projects saved by one account are never returned to another account.
- Local development exercises the real project API and reports missing configuration clearly.
- Account-scoped client state is cleared on sign-out or user change.
- The automated test suite and production build complete successfully.
