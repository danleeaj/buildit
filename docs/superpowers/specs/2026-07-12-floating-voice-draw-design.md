# Floating voice-and-draw edit control

## Goal

Keep the preview's interaction controls out of the generated app's content, while making it possible to describe and mark an edit in one continuous action.

## Placement and appearance

On a ready app, the Speak and Type controls become a compact vertical floating stack anchored to the preview's bottom-right corner. The stack is inset from the viewport and safe-area edges, above mobile browser chrome where practical, and is styled as a small neutral overlay so it clearly belongs to Superflow rather than the generated app.

The microphone is the primary, circular control. Type is a smaller secondary control above it. The controls remain accessible by name and preserve visible focus states.

## Combined voice-and-draw interaction

1. The user taps the microphone.
2. Superflow starts voice capture immediately and opens the drawing layer over the preview at the same time.
3. The microphone changes to its recording treatment and acts as the single Finish control. No separate Finish button is shown.
4. The user may speak, draw, or do both in either order.
5. Tapping the recording control again stops capture. Once transcription and annotation capture complete, Superflow sends the transcript and marked screenshot to the existing edit/refinement path.

The drawing layer retains Cancel and Clear actions. Cancel exits the combined session and discards its annotation and voice capture. Clear affects only the ink. The primary floating button must not sit over drawing tools.

## Submission and error handling

The combined session requires a usable spoken or typed instruction before refinement starts. A drawing is optional, so a spoken edit can still be submitted if no mark is made. If no instruction was captured, Superflow leaves the user in the edit capture state with clear guidance rather than sending an empty request. Microphone, transcription, and screenshot errors use the existing inline error surface and keep the generated app unchanged.

## Components and data flow

`App` owns the combined-session state and coordinates speech, drawing, and edit submission. `DrawOverlay` exposes a non-submitting capture operation so the parent can finish both assets together. `VoiceCapture` continues to support the initial app-creation experience; the ready-app floating controls are a focused component/path rather than a behavior change to entry voice capture.

On Finish, the flow is: stop speech → wait for final transcript → capture the optional annotation and targeted component → call the existing `submitEdit` path with the transcript and drawing payload. Existing snapshotting, patch validation, and recovery behavior remain unchanged.

## Verification

- The controls are visibly smaller, vertically stacked, and bottom-right on desktop and mobile viewports.
- Starting a voice edit requests/opens the microphone and drawing surface in one tap.
- The same microphone button stops the session and submits a spoken instruction with an optional drawing.
- Cancel and Clear work without changing the current app.
- Empty speech, denied microphone permission, and transcription failure do not submit an edit.
- Existing typed edit and initial voice-entry flows still work.
