# Preview staging readiness

## Goal

Accept generated apps that have successfully parsed and run their startup scripts, without rejecting them because an off-screen iframe's animation frame is deferred.

## Design

The preview bridge will send `ready` after `DOMContentLoaded`, as it does today. Staging will treat that message as the successful health signal. It will continue to fail immediately for a bridge-reported runtime error received before readiness.

Heartbeats remain diagnostic signals but will be scheduled with timers rather than `requestAnimationFrame`, so they do not depend on render scheduling in an off-screen iframe.

Staging documents do not need screenshot capture. The bridge will inject `html2canvas` only for live previews, where the draw-and-edit flow can request a capture. This keeps staging lightweight while preserving live capture behavior.

## Validation

Add coverage for staging document assembly so that the capture library is present for live previews and omitted for staging previews. Run the existing test suite and production build.
