# Live build card design

## Goal

After the user approves a proposed app by saying “Build it,” make the existing
single-row creation card feel visibly alive while the app is being generated.
The interface should communicate meaningful progress without exposing raw model
output or presenting a developer console.

## Experience

The existing build/status card remains in its current position and grows into a
larger, self-contained live activity surface. Its title stays focused on the
current task (“Creating your app” while generation is active), and its body
reveals a short, plain-language event feed one item at a time. Examples include
“Setting up the workspace,” “Sketching the first screen,” and “Adding the core
interaction.”

The most recent event has a subtle active indicator. Earlier events become
quietly complete, so the user can see what has already happened. The card is
visually compact enough to remain a progress element, not a separate terminal
screen. Motion respects reduced-motion preferences and events are announced
politely for assistive technology.

When generation finishes, the same card advances to validation. The former
“Check the result” label is renamed **“Running tests”**. Its feed communicates
preview preparation and validation, then the existing completed-app handoff
continues unchanged.

## Architecture and data flow

`ProgressPanel` owns the presentation of the expanded card. It receives the
workflow phase and derives an ordered list of display events for the current
operation. A local timer advances the currently revealed event at a measured
cadence while generation is pending. This provides continuous, legible feedback
even when the generation service has no stream event available.

The existing workflow phases remain the source of truth:

- `GENERATING` shows the expanded creation card and its creation events.
- `VALIDATING` keeps the card open, switches the active checkpoint to “Running
  tests,” and displays validation events.
- Completion, error, edit, and retry behavior retain their current workflow
  transitions.

If the generation client exposes safe, structured progress events in the
future, the panel can accept those events as an optional input and append or
replace its display events. Raw response text and source code are never shown.

## Error handling

If generation fails, the workflow’s existing error state and retry path remain
authoritative. The activity card stops advancing and does not falsely mark
unfinished work complete. Restarting generation begins a fresh event sequence.

## Verification

- Unit-test the phase-to-checkpoint mapping, including “Running tests.”
- Unit-test event reset/advancement behavior when a build starts, transitions
  to validation, completes, or errors.
- Manually verify desktop and mobile layout, accessible live announcements, and
  reduced-motion behavior.
- Run the project’s existing test and build commands after implementation.

## Scope boundary

This change improves progress communication only. It does not add incremental
preview rendering, expose generated code, or require a new streaming API
contract. Structured server-side streaming can enhance the card later without
changing the visual model.
