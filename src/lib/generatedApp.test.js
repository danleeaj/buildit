import { describe, expect, test } from "bun:test";
import {
  GENERATED_APP_HARD_LIMIT_BYTES,
  mintAppId,
  parseGeneratedAppResponse,
  parsePatchResponse,
  prepareGeneratedApp,
  validateGeneratedApp,
} from "./generatedApp.js";
import { createPreviewBridgeRuntime } from "./previewBridge.js";

const VALID_APP = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style data-style-region="app">body{margin:0}</style></head>
<body><main data-app-root data-component="App"><button id="go">Go</button></main>
<script data-behavior-region="app">document.querySelector('#go').addEventListener('click', () => {});</script>
</body></html>`;

describe("generated app response parsing", () => {
  test("accepts one exact html:app block", () => {
    const result = parseGeneratedAppResponse(`\`\`\`html:app\n${VALID_APP}\n\`\`\``);
    expect(result.ok).toBe(true);
    expect(result.value.html).toContain("data-app-root");
  });

  test("rejects prose and truncated output", () => {
    expect(parseGeneratedAppResponse(`Here it is\n\`\`\`html:app\n${VALID_APP}\n\`\`\``).ok).toBe(false);
    expect(parseGeneratedAppResponse(`\`\`\`html:app\n${VALID_APP}\n\`\`\``, { finishReason: "length" }).ok).toBe(false);
  });

  test("enforces the hard byte limit", () => {
    const oversized = `<!DOCTYPE html><html><head><style data-style-region="app"></style></head><body><main data-app-root data-component="App">${"x".repeat(GENERATED_APP_HARD_LIMIT_BYTES)}</main><script data-behavior-region="app"></script></body></html>`;
    expect(parseGeneratedAppResponse(`\`\`\`html:app\n${oversized}\n\`\`\``).ok).toBe(false);
  });
});

describe("generated app validation", () => {
  test("accepts the safe contract and assigns an app id", () => {
    const appId = mintAppId();
    const prepared = prepareGeneratedApp(VALID_APP, { appId });
    expect(prepared.ok).toBe(true);
    expect(prepared.value.html).toContain(`data-app-id="${appId}"`);
  });

  test("rejects network and direct storage APIs", () => {
    const unsafe = VALID_APP.replace(
      "document.querySelector('#go').addEventListener('click', () => {});",
      "fetch('https://example.com'); localStorage.setItem('x','y');",
    );
    const result = validateGeneratedApp(unsafe);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/network|storage/i);
  });
});

describe("patch parsing", () => {
  test("parses deterministic html, css, and js regions", () => {
    const result = parsePatchResponse([
      "```html:App",
      '<main data-app-root data-component="App">Changed</main>',
      "```",
      "```css:app",
      "body { color: black; }",
      "```",
      "```js:app",
      "document.body.dataset.ready = 'true';",
      "```",
    ].join("\n"));
    expect(result.ok).toBe(true);
    expect(result.value.html.App).toContain("Changed");
    expect(result.value.css.app).toContain("color");
  });

  test("rejects prose outside patch blocks", () => {
    const result = parsePatchResponse("Done!\n```html:App\n<div data-component=\"App\"></div>\n```");
    expect(result.ok).toBe(false);
  });
});

describe("preview bridge capture", () => {
  test("uses an in-frame SVG capture instead of html2canvas", () => {
    const runtime = createPreviewBridgeRuntime({
      sessionId: "session-1",
      appId: "app-test",
      mode: "live",
    });
    expect(runtime).toContain("foreignObject");
    expect(runtime).not.toContain("html2canvas");
  });
});
