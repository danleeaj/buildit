# Sandbox-safe drawing capture

## Goal

Preserve the draw-to-edit workflow without weakening the isolation around generated application code.

## Design

The preview bridge uses a native in-frame capture routine rather than `html2canvas`. It clones the rendered document, removes executable scripts, serializes the clone into an SVG `foreignObject`, rasterizes that SVG in a canvas, and returns the existing PNG capture payload to the parent.

The SVG must be loaded through an encoded `data:image/svg+xml;charset=utf-8` URL. A `blob:` URL created inside an iframe sandboxed without `allow-same-origin` has an opaque origin; drawing that image into a canvas can mark the canvas as tainted and make PNG export fail with a `SecurityError`. An encoded `data:` URL keeps the rasterization self-contained and origin-clean for this capture path. Because it has no object URL lifecycle, the bridge will also remove the obsolete create/revoke bookkeeping.

The generated preview remains in an `allow-scripts` sandbox without `allow-same-origin`; capture correctness must not weaken the generated-code security boundary. Hit testing and the parent-side red drawing overlay retain their current APIs and behavior. If a browser cannot rasterize or export a preview, the bridge returns a normal capture error through the existing request/response channel.

## Validation

Extend the focused bridge-runtime regression test to prove that capture:

- uses the native SVG routine rather than `html2canvas`;
- creates an encoded SVG `data:` URL rather than a `blob:` URL; and
- does not introduce `allow-same-origin` into preview sandbox configuration.

Then run the focused tests, full test suite, and production build.
