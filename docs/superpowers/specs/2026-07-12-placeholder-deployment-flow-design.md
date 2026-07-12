# Placeholder Deployment Flow Design

## Goal

Replace the current inline deployment notice with a full-screen demo deployment flow that infers the generated app's backend needs, simulates provisioning those services, and finishes on the app's existing share URL.

## Scope

- Keep the existing share endpoint and URL behavior.
- Add no production dependency and provision no real infrastructure.
- Infer requirements deterministically from the current project problem, proposal, snapshot/config, and generated HTML.
- Clearly disclose at the top of the deployment screen: “This is a demo, no backend is being wired up yet”.
- Support desktop and mobile layouts.

## Approach

Use a small pure inference module with a service catalog. Each catalog entry contains a stable ID, user-facing label, deployment verb, description, and a set of phrases or markup signals. The analyzer normalizes the project text and returns only matching services in a stable order. This is preferable to an LLM analysis because it is instant, repeatable, testable, and does not incur another model request; it is preferable to a fixed list because the screen remains specific to each generated app.

The initial catalog covers:

- Database: saved records, history, inventory, projects, tasks, bookings, notes, or other persistent collections.
- Authentication: login, sign-in, signup, accounts, users, profiles, permissions, or roles.
- File storage: uploads, attachments, photos, images, documents, files, or avatars.
- Payments: checkout, subscriptions, billing, invoices, pricing, purchases, or paid plans.
- Notifications: email, SMS, reminders, alerts, or push notifications.

If no backend service is inferred, the flow shows a frontend deployment step only. A frontend step is always last so every app has a visible deployment action.

## UI and Interaction

Selecting **Deploy** replaces the builder with a dedicated deployment screen. The screen contains:

1. A prominent top disclaimer with the exact demo copy.
2. The app title and a short explanation that Superflow inferred what the app would need.
3. A service checklist containing only inferred services plus the frontend.
4. One active status at a time, such as “Deploying database…”, with completed rows retained visibly.
5. A completion state that creates or reuses the existing share URL and displays it as the deployment URL.
6. **Copy URL**, **Open app**, and **Back to builder** actions.

The sequence is simulated with short client-side timers. The active row uses motion and a live status region; completed rows switch to a success treatment. Reduced-motion users receive the same state transitions without relying on animation for meaning.

If a user leaves the deployment screen, timers are cancelled. Starting deployment again restarts the visual sequence. The generated app and builder state remain unchanged.

## Share URL Behavior

For authenticated saved projects, deployment calls the same versions and share APIs already used by **Share current version**, then formats the returned path against `window.location.origin`. If a share URL has already been created during the session, it is reused.

Demo-mode projects cannot call the authenticated share endpoint. In demo mode, the final state will explain that a live URL is available after signing in, while still completing the simulated service sequence. This preserves the existing security boundary rather than inventing a non-working URL.

If share creation fails, the service simulation remains complete and the final panel shows the API error with a **Try again** action. The user can always return to the builder.

## Components and Boundaries

- `src/lib/backendRequirements.js`: pure inference catalog and analyzer.
- `src/lib/backendRequirements.test.js`: catalog matching, deduplication, ordering, and frontend fallback tests.
- `src/components/DeploymentScreen.jsx`: timer-driven deployment presentation and completion actions.
- `src/App.jsx`: owns deployment visibility, supplies the project analysis input, and supplies an idempotent share-URL callback.
- `src/styles.css`: responsive deployment screen styling and state treatments.

The inference module knows nothing about React or deployment timing. The deployment screen knows nothing about project APIs. `App` remains the integration boundary for project identity and sharing.

## Testing

- Unit-test representative backend signals and false/fallback cases.
- Component behavior will be verified through the production build and manual interaction because the repository currently has no React DOM test harness.
- Run the full existing Bun test suite to protect generated-app validation, workflow, persistence, and transcription behavior.
- Run the Vite production build to verify imports and compiled UI output.

## Acceptance Criteria

- Deploy opens a full-screen flow instead of showing the previous inline notice.
- The disclaimer appears at the top with the requested meaning and wording.
- Only backend services inferred from the current generated app are listed.
- Status copy advances through service-specific “Deploying …” messages.
- No backend resource is actually provisioned.
- Authenticated projects finish with the existing share URL and copy/open controls.
- Share failures are recoverable and never discard builder state.
- The flow is usable on desktop and mobile.
