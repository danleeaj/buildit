# Voice entry and projects design

## Goal

Refocus Superflow's initial screen on a single, voice-first prompt and add a lightweight Projects destination for previously created work.

## Visual direction

The screen takes its cue from a restrained music folio: black ink on warm ivory, generous empty space, and a quiet, classical wordmark. `superflow` is centered at the top in an italic serif face. The rest of the interface remains in the existing functional sans-serif, so the wordmark feels expressive without reducing clarity.

## Initial voice screen

- The central prompt reads: `What problem would you like to solve?`
- The microphone is the dominant control: a large circular, icon-only button placed below the prompt.
- A history control appears to the left of the microphone. It uses a three-line/list icon, has an accessible Projects label, and opens the projects view.
- A keyboard control appears to the right of the microphone. It opens the existing typed-input fallback.
- All three controls have at least 44px touch targets; the microphone is substantially larger and visually distinct.
- Existing API-configuration and offline feedback remain available, but do not compete with the opening interaction.

## Voice interaction

- Pressing the microphone starts or stops the existing speech capture behavior.
- When recording starts, the question smoothly scales down and moves upward. The transition uses opacity and transform only, lasts about 200ms, and respects reduced-motion preferences.
- A live transcription line appears below the reduced prompt while speech is being captured. It is visually secondary through a muted color and smaller type, but retains its polite live region.
- The microphone gets a clear recording state without relying only on color (for example, a state label for assistive technology and an animated ring where motion is allowed).
- Once text is available and recording has stopped, the existing submit action remains accessible.

## Projects destination

- Selecting the history control replaces the opening screen with a full-screen Projects view.
- The view enters from below, visually carrying the surface upward as if the user scrolled into it. It is not a modal or side panel.
- A return control reverses the same movement, bringing the voice screen back down.
- The page includes a `Projects` heading and one intentionally minimal placeholder project card. The card does not claim persistence or implement project navigation yet.

## Boundaries and state

- Add local UI state for whether the Projects screen is open; it must not affect workflow, generation, last-app persistence, or the existing generated-app view.
- Keep `VoiceCapture` reusable for edit sheets. The new composition and project transition apply only to the initial no-app voice entry state.
- Keyboard input continues to use the current controlled draft and existing `submitProblem` handler.

## Accessibility and resilience

- Icon-only controls have descriptive `aria-label` text.
- Keyboard navigation follows the visual action order: Projects, microphone, type.
- Preserve visible focus indicators and existing voice errors.
- Use `prefers-reduced-motion` to disable nonessential motion while keeping the projects screen fully usable.

## Verification

- Build the project successfully.
- Manually verify the Projects transition and reverse transition.
- Manually verify microphone, type, and submit behavior in the initial screen.
- Verify the edit-sheet voice capture retains its existing layout and behavior.
