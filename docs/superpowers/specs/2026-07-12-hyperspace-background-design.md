# Hyperspace background design

## Goal

Add a decorative, full-shell starfield inspired by the supplied Hyperspace reference. It provides a calm motion signal for idle states and a visible acceleration signal while Superflow listens, transcribes, or works.

## Visual treatment

- Invert the reference into a paper treatment: a warm white canvas with charcoal/black stars.
- Cruise mode draws sparse, drifting points.
- Workload mode eases into radial streaks from the screen center, creating a restrained star-warp effect.
- The canvas is decorative only. There is no label, toggle, or other user control.
- All application content rests over a lightly translucent ivory layer with `backdrop-filter: blur(...)` so copy and controls remain readable while the field is still perceptible.

## State mapping

- **Cruise:** idle voice entry, Projects, awaiting proposal approval, completed generated-app view, and errors.
- **Workload:** microphone permission/request, listening, or transcription; proposing, generating, validating, editing, and edit validation workflow phases.
- The field remains mounted behind every screen, changing speed instead of resetting during view transitions.

## Implementation boundaries

- Add one React canvas component at the app-shell level; it must be pointer-inert and hidden from assistive technology.
- Drive workload state from the existing speech and workflow state already available in `App`.
- Recalculate canvas dimensions on resize, observe device-pixel ratio, and clean up animation and resize listeners on unmount.
- Respect `prefers-reduced-motion` by rendering a static, sparse field without continuous animation.
- Do not use the source file's control panel, colors, or toggle behavior.

## Verification

- Build successfully.
- Confirm the canvas is present behind initial, Projects, and generated-app screens.
- Confirm it accelerates for voice capture and workflow operations, then returns to Cruise.
- Confirm foreground content stays legible and the background cannot receive pointer or keyboard focus.
