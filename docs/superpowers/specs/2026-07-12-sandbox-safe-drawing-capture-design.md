# Sandbox-safe drawing capture

## Goal

Preserve the draw-to-edit workflow without weakening the isolation around generated application code.

## Design

The preview bridge will replace its `html2canvas` dependency with a native in-frame capture routine. It will clone the rendered document, remove executable scripts, serialize the clone into an SVG `foreignObject`, rasterize that SVG in a canvas, and return the existing PNG capture payload to the parent.

The generated preview remains in an `allow-scripts` sandbox without `allow-same-origin`. Hit testing and the parent-side red drawing overlay retain their current APIs and behavior. If a browser cannot rasterize a preview, the bridge returns a normal capture error rather than leaking a cross-origin exception into the workflow.

## Validation

Add a focused bridge-runtime regression test proving capture uses the native routine rather than `html2canvas`, then run the test suite and production build.
