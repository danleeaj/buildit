# Voice prompt serif treatment

## Decision

Use an upright, high-contrast serif face for the initial voice prompt, `What problem would you like to solve?`.

## Rationale

The upright prompt gives the main question an editorial, classical presence while preserving a distinction from the italic serif `superflow` wordmark. Functional UI—including controls, typed input, transcription, and project content—remains sans-serif for clarity.

## Scope

- Apply only to the initial voice-entry prompt.
- Preserve the existing prompt size, contrast, responsive behavior, and recording-state animation.
- Do not change typography in reusable edit-sheet voice capture or generated-app screens.

## Verification

- Build the app successfully.
- Confirm the initial voice prompt is upright serif and the wordmark remains italic serif.
