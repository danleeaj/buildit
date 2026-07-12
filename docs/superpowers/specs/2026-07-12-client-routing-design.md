# Client Routing and Logout Design

## Scope

Replace the app's implicit single-screen state with small, browser-addressable client routes. Add logout, predictable access guards, and a persistent navigation boundary without adding a routing dependency.

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/sign-in` | public | Email/password, Google, and one-click demo entrance. |
| `/projects` | authenticated | Project list and opening point for new or existing work. |
| `/build` | authenticated | Current Superflow builder workspace. |
| `/demo` | public | Seeded demo workspace; interactions remain in memory. |
| `/share/:token` | public | One frozen, read-only published version. |

Authenticated visitors who open `/sign-in` are redirected to `/projects`. Signed-out visitors who open `/projects` or `/build` are redirected to `/sign-in`. Unknown routes use the same safe redirect according to session state.

## Implementation

Use a small history API router owned by the application root. It reads `window.location.pathname`, navigates with `history.pushState`, and updates route state on `popstate`. It has no external dependency.

Vercel receives an SPA rewrite to serve `index.html` for client routes, while preserving `/api/*` routes for Vercel Functions. This makes direct loads and refreshes of `/projects`, `/build`, `/demo`, and `/share/:token` work.

## Navigation and session behavior

Authenticated screens use a persistent navigation area with:

- **Projects** → `/projects`
- **New app** → `/build` with a fresh workflow
- **Log out** → calls Neon Auth `signOut`, clears active project and transient workspace state, and navigates to `/sign-in`

The demo route shows a **Leave demo** action that navigates to `/sign-in`. It never calls sign-out, creates a Neon session, or sends a database write.

## Shared versions

`/share/:token` loads `GET /api/shared/:token` and renders the returned HTML in the existing safe preview frame. It has no edit, save, navigation-to-project, or authentication requirement. Missing, revoked, expired, or malformed tokens render a neutral not-found state.

## Errors and checks

- Route loading states are visible while session or shared-version data is pending.
- Auth failures navigate to `/sign-in` without exposing the failed API response.
- Demo and shared-version failures do not leak database details.
- Tests cover route parsing, navigation/popstate behavior, access guards, logout state clearing, demo non-persistence, and shared-token not-found behavior.
- Manual verification covers direct route refreshes on Vercel and browser Back/Forward transitions.

## Non-goals

- Server-side rendered routes or a migration to Next.js.
- A third-party router library.
- Changing Neon Auth providers or project storage rules.
