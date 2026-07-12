# BuildIt Demo-First PWA Design

- Date: 2026-07-12
- Status: Design approved in conversation; written-spec review pending
- Scope: First dependable demo milestone, followed immediately by live edit variants
- Source: `prd.md`, revised by the decisions recorded below

## 1. Product Definition

BuildIt is a voice-and-ink-first app builder for nontechnical users. A user explains a problem aloud, receives a short proposed solution, approves it, and gets a working app. They refine that app by drawing directly on it and speaking the requested change. Typing exists as an accessibility and quiet-room fallback, not as the primary product interface. “Ink” means freehand circles and annotations used to identify a target; semantic handwriting recognition and OCR are not included.

The initial product generates arbitrary **single-screen, client-only applications**. Generated apps may contain custom HTML, CSS, JavaScript behavior, local state, calculations, workflows, schedulers, dashboards, and small games. The first milestone excludes backends, authentication, payments, realtime collaboration, external integrations, and multipage navigation.

BuildIt itself is an installable Progressive Web App. The installed shell can open offline, but generation and AI-assisted editing require a network connection.

## 2. Decisions That Override the Original PRD

This specification intentionally changes four parts of `prd.md`:

1. **Arbitrary app generation replaces skeleton-only generation.** The tracker and collector renderers are no longer the product architecture. One model call generates a complete single-file app.
2. **Voice and ink gestures replace chat as the primary interaction.** Chat-style history may appear as a compact activity transcript, while typing is a secondary option.
3. **The design contract is replaced.** The current marketing-oriented `design.md` will become a quiet-native, mobile utility-app system.
4. **PWA support is part of the first dependable milestone.** BuildIt receives a web app manifest, install icons, production service worker, standalone presentation, and offline shell state.

All unchanged PRD constraints still apply, including the problem-first proposal, conversation-seeded personalization, direct manipulation, patch-after-generation editing, latency targets, real-phone testing, and ten successful demo rehearsals.

## 3. Goals and Non-Goals

### Goals

- Turn a spoken problem into a personalized working app in one generation call after approval.
- Keep the normal generation path near the PRD's five-second target.
- Generate custom client-side behavior instead of reskinning predefined templates.
- Let users circle a region and speak a change without describing technical structure.
- Never replace the last working app with invalid generated output.
- Feel like a quiet, polished mobile app rather than a chat product or desktop builder.
- Install as a PWA and launch in standalone mode.
- Add two live edit variants immediately after the dependable core loop passes its acceptance gate.
- Add no new production dependencies for this milestone.

### Non-Goals

- Server-side execution, databases, accounts, payments, or realtime collaboration.
- Arbitrary network access from generated applications.
- Multipage generated applications.
- Independent PWA installation of each generated app in the first milestone.
- Production-grade isolation for untrusted third-party code.
- Fully offline generation or editing.
- A large visible chat transcript, code editor, model selector, settings panel, or desktop-style navigation bar.

## 4. User Experience

### 4.1 Visual Direction

The approved direction is **quiet native with minimal chrome**:

- Pure white canvas with charcoal text and restrained neutral-gray grouping surfaces.
- System sans-serif typography with natural sentence case.
- Moderate 11–17px radii on grouped controls and surfaces.
- Subtle hairlines and light shadows only where they communicate layering.
- No gradients, pastel feature-card palette, oversized glowing microphone orb, rigid brutalist grids, or repeated pill treatment.
- Red is reserved for active recording status and freehand ink annotations.
- Touch targets are at least 44px even when their visible icon is smaller.

The replacement `design.md` will express these rules as compact tokens and component recipes suitable for prompts and generated apps.

### 4.2 Mobile Flow

1. **Problem input:** A minimal BuildIt screen asks what should work better. The main control is a hold-to-talk action with a small live waveform. “Type instead” is visibly secondary.
2. **Proposal:** The app name and no more than three capabilities are shown succinctly. The user approves by saying “yes” while voice capture is active or by tapping the build action. Speech synthesis is not part of this milestone.
3. **Generation:** A focused progress state shows the current phase without exposing model or code details.
4. **Live app:** The generated app fills the phone. BuildIt contributes only a compact back control plus a thumb-reachable bottom tool dock. The share control remains hidden until QR sharing is implemented after variants.
5. **Editing:** The user draws on the app. After the target is captured, voice recording becomes active and the transcript is shown in a compact bottom sheet.
6. **Commit:** The user confirms the spoken change. The affected region shimmers while the validated patch is prepared.

The bottom dock prioritizes drawing and voice. The keyboard action remains smaller and less visually prominent.

### 4.3 Desktop Flow

Desktop retains a side-by-side workspace because it is useful for the stage demo, but it does not resemble a chat application:

- A compact input/activity rail contains the primary hold-to-talk control, proposal, status, and a collapsed transcript.
- The live phone preview receives most of the available space.
- Drawing occurs directly over the phone preview.
- Text entry is available through a secondary control rather than a permanently dominant composer.

### 4.4 Accessibility and Capability Fallbacks

- Use `SpeechRecognition` or `webkitSpeechRecognition` when available.
- Show interim transcript text so users can see that speech is being captured.
- If speech recognition is unavailable or permission is denied, explain the limitation and reveal the typed fallback immediately.
- Preserve keyboard access, focus indicators, reduced-motion behavior, semantic labels, and 44px touch targets.
- The primary stage target is a current iPhone running Safari, with desktop Chromium as the presentation host and Android Chrome as a secondary compatibility check.
- The phone demo and installed PWA must use HTTPS because voice and installation depend on a secure context.
- On iOS, installation instructions use Safari's Share → Add to Home Screen flow; browsers exposing a programmatic install prompt may use the secondary install action described later.

Audio-file upload and server-side transcription are not part of this first milestone.

## 5. Application Architecture

### 5.1 Parent Responsibilities

The React/Vite parent owns:

- Conversation and workflow state.
- Voice capture and typed fallback.
- Proposal and generation requests.
- Generated-document validation.
- The last valid app document and rollback history.
- Persistence of the last valid app under the parent-owned `buildit:last-app` local-storage key so it survives reload and offline launch.
- Iframe rendering.
- Drawing, screenshot annotation, and component hit-testing.
- Patch parsing, candidate validation, and commit.
- PWA install/offline state.
- An opaque-preview `postMessage` bridge for hit-testing, screenshots, readiness, errors, and parent-owned storage.

`App.jsx` becomes a workflow coordinator rather than holding model, validation, rendering, and UI details in one file. Pure generation-contract, validation, document-patching, and workflow helpers remain independently testable.

### 5.2 Workflow State

The core state machine is:

```text
idle
  -> capturing_problem
  -> proposing
  -> awaiting_approval
  -> generating
  -> validating
  -> ready
  -> drawing
  -> capturing_edit
  -> editing
  -> validating_edit
  -> ready
```

Any network or validation failure enters a recoverable error state that retains the last valid app. Explicit states remove unnecessary intent-router calls when the next action is already known. After an app exists, a voice-only request edits the app root, a draw-then-voice request edits the selected component, and an explicit “New app” action starts over; no free-form intent router is required in the dependable core.

### 5.3 One-Shot Generation

After proposal approval, `generateApp()` makes one model call containing:

- The full relevant conversation.
- The approved proposal.
- The mobile design contract.
- The generated-document contract.
- Seed-data instructions that preserve names, places, amounts, and other user details.

The model returns exactly one fenced block labeled `html:app` and no surrounding prose. The normal call is capped at 8,000 output tokens, targets at most 16KB of UTF-8 HTML, and has a hard validator limit of 32KB before the fixed preview bridge is injected. A missing closing fence, multiple app blocks, trailing prose, or a length-truncated response is rejected. There is no planner call in the normal path. The single retry budget is used only for a rejected or invalid result and explicitly asks for a compressed document below the hard limit.

### 5.4 Generated-Document Contract

Every generated app must:

- Be a complete `<!doctype html>` document.
- Contain one `[data-app-root]` element. The parent assigns and preserves a `data-app-id` with `crypto.randomUUID()`; the model does not mint identifiers used for storage or preview isolation.
- Keep all CSS and JavaScript inline.
- Contain a required `<style data-style-region="app">` block and `<script data-behavior-region="app">` block; either may be empty.
- Give every additional style or behavior block a unique region name matching an existing component; only the required global regions use `app`.
- Use vanilla browser APIs with no runtime package or CDN dependency.
- Mark every independently editable region with a unique `data-component` value matching `^[A-Za-z][A-Za-z0-9_-]{0,63}$`.
- Use semantic HTML and responsive mobile-first CSS.
- Target 16KB and remain at or below the 32KB hard document limit.
- Use the injected asynchronous `window.BuildItStore` API for optional persistence; direct cookies, `localStorage`, `sessionStorage`, and IndexedDB access are prohibited inside the opaque preview.
- Avoid `fetch`, `XMLHttpRequest`, `WebSocket`, navigation, popups, `eval`, `Function`, `document.write`, workers, parent-frame access, inline `on*` event attributes, and externally loaded scripts, styles, fonts, images, or media.
- Avoid `<base>`, nested frames, objects, embeds, portals, meta refresh, actionable form URLs, CSS imports, and non-`data:`/`blob:` CSS URLs.

The generated app may implement any single-screen local behavior that fits these boundaries.

### 5.5 Validation and Rendering

The parent parses the response, removes any model-provided CSP, and assigns the stable app ID before validation. Before a generated document reaches the iframe, validation checks:

- Document size and doctype.
- Exactly one app root.
- A parent-minted app identifier that remains unchanged across edits.
- Required app style/behavior regions and unique optional region names.
- At least one editable component and unique component identifiers.
- Required viewport metadata.
- Absence of forbidden elements, attributes, CSS URLs, storage APIs, external resources, and prohibited JavaScript APIs.
- JavaScript syntax by compiling each behavior region without executing it.
- Successful serialization after DOM parsing.

After static validation, the parent injects a fixed bridge plus this enforcing policy:

```text
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; connect-src 'none'; font-src 'none'; media-src 'none';
object-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none';
base-uri 'none'
```

The assembled document first runs in a hidden staging iframe with `sandbox="allow-scripts"` and no `allow-same-origin`. Staging receives a nonpersistent storage namespace. The fixed bridge reports DOM readiness, uncaught errors, unhandled rejections, and two heartbeats 250ms apart within a 1,500ms staging window. The current app remains visible during staging. Only a candidate that passes static validation and the smoke check is promoted into the real app storage namespace. This smoke check improves reliability but is not presented as a proof against deliberately hostile or nonterminating code.

The same fixed bridge bundles the existing screenshot capability and exposes session-scoped `postMessage` operations for hit-testing, capture, readiness, and `BuildItStore`. `BuildItStore` provides asynchronous `get`, `set`, and `remove` operations for JSON values under the assigned app ID, with a 64KB per-app quota enforced by the parent. The parent accepts messages only from the expected iframe window with the current unguessable session ID. Generated code runs in an opaque origin and cannot read the parent document, storage, or API key.

A failed candidate receives one repair request containing the validation errors. If repair also fails, BuildIt shows a recoverable message and preserves the previous app.

### 5.6 Demo Credential Boundary

The existing browser-bundled API key remains a hackathon-only compromise even though the opaque iframe protects it from generated code. The HTTPS demo deployment must use a temporary key, remain private and short-lived, and rotate the key immediately after the event. Public distribution is blocked until model requests move behind a server-side API proxy.

## 6. Editing Architecture

### 6.1 Target Capture

The drawing overlay uses Pointer Events and `touch-action: none`. It records the stroke and translates overlay coordinates into iframe viewport coordinates. The parent sends the centroid through the session-scoped bridge; the opaque iframe performs `elementFromPoint`, finds the closest `[data-component]` ancestor, and captures its own document with the injected screenshot capability. It returns the component identifier and base screenshot, and the parent composites the recorded stroke into the annotated image. The selected component and spoken instruction become the edit request.

The coordinate transform must account for iframe scrolling, device pixel ratio, and the overlay's client rectangle. Drawing on a phone must not scroll the page.

### 6.2 Patch Contract

For presentation-only requests, the edit model receives the selected component HTML, matching style region, annotated screenshot, instruction, and design contract. A behavior request additionally receives the matching behavior region and the global `app` behavior interface. It returns fenced blocks with these exact labels:

- One or more complete `html:<component-name>` replacement blocks.
- Optional complete `css:<region-name>` blocks when styles change.
- Optional complete `js:<region-name>` blocks when behavior changes.

BuildIt applies the response to a cloned document, runs the complete generated-document validator and smoke check, and commits the clone only when valid. Every HTML replacement must preserve its targeted outer `data-component` identifier. One response may not replace both an ancestor and its descendant. New child identifiers are allowed when they remain unique. A response that names no existing component or region, removes the app root, duplicates identifiers, overlaps replacements, or introduces prohibited behavior is rejected.

### 6.3 Variants

After the dependable core acceptance gate passes, the same edit request is sent twice in parallel with contrasting but design-compliant directions. Each candidate is independently patched and validated. Candidate previews receive isolated, nonpersistent bridge namespaces, so they cannot mutate the original app's stored state or each other. The user sees two live mini-previews and selects one; selection commits that candidate under the original app ID and storage namespace. The original remains available until a choice is made.

## 7. PWA Design

BuildIt itself is the installable application.

### 7.1 Manifest and Icons

`manifest.webmanifest` defines:

- Name and short name: BuildIt.
- Relative start URL and scope: `.` so installation works at the domain root or a Vite subpath.
- Display mode: `standalone`.
- White background and theme colors.
- 192px and 512px standard icons.
- 192px and 512px maskable icons.

`index.html` links the manifest, theme-color metadata, and an Apple touch icon. The icon system is monochrome and consistent with the quiet-native direction.

### 7.2 Service Worker

The production build registers a dependency-free service worker using `import.meta.env.BASE_URL`; development mode does not and unregisters any BuildIt worker left by a prior production preview. A small local Vite build hook emits `precache-manifest.json` from the final bundle graph, avoiding a PWA package while still discovering hashed assets.

- During installation, the worker reads the precache manifest and atomically caches `index.html`, the web manifest, icons, and every emitted JavaScript/CSS asset before installation succeeds.
- Navigation requests use network-first behavior with cached shell fallback.
- Precached static assets and icons use cache-first behavior.
- API requests, cross-origin requests, and non-GET requests are always network-only.
- Cache names are versioned, and activation removes obsolete caches.
- The worker takes control after activation without leaving a stale development build registered.

After the first online visit completes service-worker installation, the next launch can load the full shell offline, restore `buildit:last-app` when present, and explain that generation and AI editing need a connection.

### 7.3 Install Experience

An install action may appear inside the secondary help/overflow surface when the browser exposes an install prompt. BuildIt does not use an intrusive install banner or add installation controls to the primary app chrome.

## 8. Error Handling

| Failure | Behavior |
| --- | --- |
| Missing API key | Disable generation and show a concise setup error. |
| Offline before generation/edit | Keep the shell and last app usable; explain that AI actions need a connection. |
| Speech unavailable | Reveal typed fallback and retain the same workflow. |
| Microphone permission denied | Explain how to re-enable access; offer typing immediately. |
| Proposal/generation network failure | Keep the user's transcript and allow retry without re-recording. |
| Generated document fails validation | Attempt one repair; preserve the last valid app if repair fails. |
| Edit returns no applicable target | Reject it and ask the user to circle again. |
| Patched document fails validation | Preserve the original app and allow retry. |
| Iframe or screenshot failure | Exit drawing mode safely and retain the app. |
| PWA cache is stale | Activate the versioned worker and remove obsolete caches. |

User-facing errors avoid model, token, schema, and code terminology.

## 9. Testing and Instrumentation

No new production dependency is required. Pure helpers use Bun's built-in test runner.

### Automated Checks

- Valid and invalid generated-document fixtures.
- Prohibited API and external-resource detection.
- Duplicate/missing component detection.
- Generated-response envelope, byte-limit, and truncation rejection.
- JavaScript syntax rejection.
- Opaque-bridge message source/session validation.
- Staging readiness, heartbeat, runtime-error, and timeout rejection.
- Patch application and rollback behavior.
- Overlapping replacement and region-name rejection.
- Variant storage-namespace isolation.
- Workflow-state transitions.
- Production build completion.
- Manifest presence and required fields.
- Base-path-aware manifest/service-worker URLs.
- Precache manifest completeness and first-install offline shell availability.
- Service-worker registration guard and request-strategy helpers.

### Device and Browser Checks

- Desktop Chromium: voice fallback, proposal, generation, drawing, patch, and variants.
- Current iPhone Safari over HTTPS: microphone permission, live transcript, spoken or tapped approval, touch drawing without scroll, full-screen layout, manual Add to Home Screen, standalone launch, and offline shell after first install completes.
- Android Chrome secondary pass: voice capture, programmatic install prompt when exposed, standalone launch, and drawing.
- Narrow mobile viewport and small-laptop viewport visual checks.
- Reload and service-worker update behavior.

### Latency Instrumentation

Capture `performance.now()` timestamps for proposal, generation, validation, repair, edit, and variant selection. Show friendly progress states to the user and log exact timings for rehearsal tuning.

## 10. Delivery Order

1. Replace the existing marketing-oriented design contract and chat-dominant shell with the approved quiet-native voice-and-ink interface.
2. Introduce workflow state, exact response contracts, static validation, opaque preview bridge, staging smoke checks, and tests.
3. Replace tracker-only config rendering with one-shot custom document generation and repair fallback.
4. Add voice-first problem capture and typed fallback.
5. Harden draw targeting, voice-after-draw editing, patch validation, and rollback.
6. Add manifest, icons, service worker, offline shell state, and install affordance.
7. Verify production build and the full loop on a real phone over HTTPS.
8. Rehearse the core loop ten consecutive times and fix failures.
9. Add two parallel live edit variants and re-run the acceptance checks.

### 10.1 Seven-Hour Cut Line

The approved changes supersede the PRD's original locked seven-hour schedule; the complete revised scope must not be represented as the same seven-hour build. If an external seven-hour deadline remains absolute, preserve one-shot custom behavior generation, voice input with typed fallback, opaque preview isolation, safe component editing, the web app manifest, standalone presentation, phone verification, and rehearsal. Cut work in this order:

1. QR sharing.
2. Live variants.
3. Behavior-changing edit patches; keep component presentation patches.
4. Offline precache and install polish; keep the manifest and standalone metadata.

Security isolation, last-valid rollback, and real-phone testing are not cuttable.

## 11. Acceptance Gate

The dependable core milestone is complete only when:

- A user can speak a problem and see an accurate transcript or use the typed fallback.
- The proposal contains one confident app concept with no more than three capabilities.
- Approval triggers one normal-path generation call.
- The resulting app has custom single-screen behavior and personalized seed content.
- Typical successful generation remains near five seconds, excluding speech duration.
- Drawing and a spoken instruction update the intended region without scrolling the phone page.
- Invalid generation or edits never replace the last valid app.
- The production app installs and launches in standalone PWA mode over HTTPS.
- The shell launches offline and clearly disables only network-dependent actions.
- `bun test` and `bun run build` pass.
- The full core demo succeeds ten times consecutively on the target demo setup.

This gate deliberately excludes variants and QR sharing. After it passes, live variants are the immediate next deliverable; QR sharing follows variants and completes the broader PRD demo loop.
