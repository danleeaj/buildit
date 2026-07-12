# Neon Auth and Project Persistence Design

## Scope

Add durable, authenticated project persistence to Superflow without migrating its existing Vite + React frontend to Next.js. Users can create accounts, sign in, and retain generated applications and their histories. Guests can separately enter a non-persistent demo workspace.

## Chosen architecture

Keep the Vite frontend and add Vercel serverless functions under `/api`.

- Neon Auth handles account creation, email/password sign-in, sessions, verification, and password reset.
- The frontend uses only `VITE_NEON_AUTH_URL` to communicate with Neon Auth.
- Serverless functions use the private `DATABASE_URL` to access Neon Postgres.
- No database connection string or privileged credential reaches browser code.
- Every authenticated project API verifies the Neon Auth session and authorizes access using the authenticated user ID.

This approach preserves the current app structure while keeping all database access and ownership decisions server-side.

## Data model

Neon Auth owns authentication data. App data uses the authenticated Neon user ID as its ownership key.

### `profiles`

Optional product-level user information: user ID, display name, preferences, creation time, and update time.

### `projects`

The current persistent workspace: ID, owner user ID, title, source problem statement, current generated HTML/configuration, conversation state, creation time, and update time.

### `project_versions`

Immutable snapshots of generated application state. Each row records its project, version number, generated HTML/configuration, optional edit note, and creation time. The latest snapshot is the project’s current state and allows safe restoration or publication.

### `share_links`

Read-only publication records: an opaque, unguessable token, project/version reference, enabled flag, optional expiration, and timestamps. A link grants access only to the referenced published version; it never provides project editing rights.

### Seeded demo data

A dedicated demo account owns a seeded demo project and version history. Its credentials are never displayed or used by visitors.

### Persistence lifecycle

Creating a project writes its initial `projects` row and first `project_versions` snapshot. Each accepted generated-app edit creates one new immutable version and updates the project’s current generated state. Publishing always targets a specified version, so a later edit never changes what an existing share link renders.

## Client and API flows

### Signed-in user

1. The Vite client uses Neon Auth for sign-up, sign-in, and session state.
2. The client calls protected `/api` routes with that session.
3. A Vercel function validates the session, checks ownership, and reads or writes Neon data.
4. The client receives only the data it is authorized to display or edit.

### Guest demo

1. A separate **Try the demo** entrance requests a safe demo snapshot from `GET /api/demo`.
2. The client loads the demo project and history into in-memory state.
3. Guest edits, variants, and interactions affect in-memory state only.
4. Refreshing or leaving restores the original seeded snapshot. No guest action writes to Neon or modifies the demo account.

### Public sharing

1. A signed-in owner publishes a particular project version and receives a share token.
2. A visitor opens `GET /api/shared/:token`.
3. The function returns only the published, read-only version. Disabled, expired, or unknown tokens return 404.

## API boundaries

- `GET /api/demo`: returns the sanctioned demo project snapshot and history; no write capability.
- Protected project routes: list, create, fetch, update, version, publish, and unpublish projects only after authentication and owner checks.
- `GET /api/shared/:token`: returns a single published version without account access.

The exact route file layout can follow Vercel’s Vite conventions, while the behavior and authorization contract above remain fixed.

## Errors and security

- Unauthenticated protected requests return `401`.
- Access to a project owned by another user returns `404`, avoiding project enumeration.
- Invalid request data returns `400` with safe, actionable details.
- Database and provider failures return `500` without connection details or stack traces.
- Share tokens are generated with cryptographically secure randomness and stored uniquely.
- All write inputs are validated before database work.

## Environment variables

Vercel’s Neon integration supplies these values; they are not committed to the repository.

- `DATABASE_URL`: private, server-only pooled Neon Postgres URL.
- `VITE_NEON_AUTH_URL`: public Neon Auth endpoint for the Vite client.
- `NEON_AUTH_BASE_URL`: server-side Neon Auth endpoint for protected API validation.
- `DATABASE_URL_UNPOOLED`: optional later migration-tool connection; not required for the initial runtime.

## Verification

Automated coverage will prove:

- a user cannot read or write another user’s projects;
- demo interactions make no database writes and reset on refresh;
- a valid share token returns only its published version;
- revoked, expired, and unknown share tokens return `404`;
- the normal project and version lifecycle works end to end.

Manual checks will cover sign-up/sign-in, Vercel environment configuration, and the existing build and preview flow.

## Non-goals

- Migrating the Vite app to Next.js.
- Direct client access to the Neon database.
- Guest-to-account conversion or guest persistence.
- Giving public links edit access.
