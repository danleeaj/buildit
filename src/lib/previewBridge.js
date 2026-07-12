export const PREVIEW_MESSAGE_SOURCE = "superflow-preview";
export const PARENT_MESSAGE_SOURCE = "superflow-parent";

export const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "connect-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export function createPreviewSessionId() {
  return crypto.randomUUID();
}

function serializeDocument(doc) {
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

export function createPreviewBridgeRuntime({ sessionId, appId, mode }) {
  const config = JSON.stringify({ sessionId, appId, mode }).replaceAll("<", "\\u003c");

  return `(() => {
    "use strict";
    const CONFIG = ${config};
    const nativeSetTimeout = window.setTimeout.bind(window);
    const pendingStorage = new Map();
    let requestSequence = 0;

    const send = (type, payload = {}) => {
      window.parent.postMessage({
        source: "${PREVIEW_MESSAGE_SOURCE}",
        sessionId: CONFIG.sessionId,
        appId: CONFIG.appId,
        mode: CONFIG.mode,
        type,
        ...payload,
      }, "*");
    };

    const storageRequest = (operation, key, value) => new Promise((resolve, reject) => {
      const requestId = "storage-" + (++requestSequence);
      const timeoutId = nativeSetTimeout(() => {
        pendingStorage.delete(requestId);
        reject(new Error("Storage request timed out"));
      }, 2500);
      pendingStorage.set(requestId, { resolve, reject, timeoutId });
      send("storage-request", { requestId, operation, key, value });
    });

    Object.defineProperty(window, "SuperflowStore", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: Object.freeze({
        get: (key) => storageRequest("get", key),
        set: (key, value) => storageRequest("set", key, value),
        remove: (key) => storageRequest("remove", key),
      }),
    });

    const capturePreview = () => new Promise((resolve, reject) => {
      let objectUrl = "";
      try {
        const width = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
        const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
        const copy = document.documentElement.cloneNode(true);
        copy.querySelectorAll("script, meta[http-equiv='Content-Security-Policy']").forEach((element) => element.remove());
        copy.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

        const markup = new XMLSerializer().serializeToString(copy);
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><foreignObject width="100%" height="100%">' + markup + "</foreignObject></svg>";
        objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));

        const image = new Image();
        image.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Screenshot canvas is unavailable");
            context.drawImage(image, 0, 0, width, height);
            resolve({
              dataUrl: canvas.toDataURL("image/png"),
              width,
              height,
              viewportWidth: width,
              viewportHeight: height,
              scrollX: window.scrollX,
              scrollY: window.scrollY,
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        };
        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Could not capture the generated app."));
        };
        image.src = objectUrl;
      } catch (error) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    window.addEventListener("message", async (event) => {
      const message = event.data;
      if (event.source !== window.parent || !message || message.source !== "${PARENT_MESSAGE_SOURCE}" || message.sessionId !== CONFIG.sessionId) return;

      if (message.type === "storage-result") {
        const pending = pendingStorage.get(message.requestId);
        if (!pending) return;
        pendingStorage.delete(message.requestId);
        clearTimeout(pending.timeoutId);
        if (message.ok) pending.resolve(message.value);
        else pending.reject(new Error(message.error || "Storage failed"));
        return;
      }

      if (message.type !== "request") return;
      try {
        if (message.action === "hit-test") {
          const element = document.elementFromPoint(message.x, message.y);
          const target = element?.closest?.("[data-component]");
          const rect = target?.getBoundingClientRect?.();
          send("response", {
            requestId: message.requestId,
            ok: true,
            value: {
              component: target?.getAttribute("data-component") || null,
              rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
              scrollX: window.scrollX,
              scrollY: window.scrollY,
            },
          });
          return;
        }

        if (message.action === "capture") {
          const capture = await capturePreview();
          send("response", {
            requestId: message.requestId,
            ok: true,
            value: capture,
          });
          return;
        }

        if (message.action === "ping") {
          send("response", { requestId: message.requestId, ok: true, value: { alive: true } });
          return;
        }

        throw new Error("Unknown bridge action");
      } catch (error) {
        send("response", {
          requestId: message.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    window.addEventListener("error", (event) => {
      send("runtime-error", { error: event.message || "Generated app failed" });
    });

    window.addEventListener("unhandledrejection", (event) => {
      send("runtime-error", {
        error: event.reason instanceof Error ? event.reason.message : String(event.reason || "Generated app promise failed"),
      });
    });

    const announceReady = () => {
      send("ready");
      // Staging runs in an off-screen iframe, where animation frames may be
      // deferred indefinitely. Heartbeats are diagnostic only, so do not make
      // them depend on the rendering scheduler.
      nativeSetTimeout(() => send("heartbeat", { index: 1 }), 0);
      nativeSetTimeout(() => send("heartbeat", { index: 2 }), 250);
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", announceReady, { once: true });
    else announceReady();
  })();`;
}

export function assemblePreviewDocument(html, { appId, sessionId, mode = "live" }) {
  if (typeof DOMParser === "undefined") {
    throw new Error("Preview assembly requires a browser DOMParser");
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector("[data-app-root]");
  if (!root) throw new Error("Generated app root is missing");

  root.setAttribute("data-app-id", appId);
  root.setAttribute("data-superflow-mode", mode);
  doc.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]').forEach((element) => element.remove());

  const csp = doc.createElement("meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  csp.setAttribute("content", PREVIEW_CSP);
  doc.head.prepend(csp);

  const behaviorScripts = [...doc.querySelectorAll("script[data-behavior-region]")];
  behaviorScripts.forEach((script) => script.remove());

  const bridge = doc.createElement("script");
  bridge.setAttribute("data-superflow-bridge", "true");
  bridge.textContent = createPreviewBridgeRuntime({ sessionId, appId, mode });

  doc.head.append(bridge);
  behaviorScripts.forEach((script) => doc.body.append(script));

  return serializeDocument(doc);
}

export function stagePreviewDocument(html, { appId, timeoutMs = 1500 } = {}) {
  if (typeof document === "undefined") {
    return Promise.resolve({ ok: false, errors: ["Preview staging requires a browser document"] });
  }

  const sessionId = createPreviewSessionId();
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "390px",
    height: "780px",
    border: "0",
    pointerEvents: "none",
    opacity: "0",
  });

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      iframe.remove();
      resolve(result);
    };

    const onMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      const message = event.data;
      if (!message || message.source !== PREVIEW_MESSAGE_SOURCE || message.sessionId !== sessionId) return;

      // ponytail: respond to storage requests with empty defaults during staging
      // so generated apps that hydrate on load don't crash the health-check.
      if (message.type === "storage-request") {
        iframe.contentWindow.postMessage({
          source: PARENT_MESSAGE_SOURCE,
          sessionId,
          type: "storage-result",
          requestId: message.requestId,
          ok: true,
          value: message.operation === "get" ? undefined : null,
        }, "*");
        return;
      }

      if (message.type === "runtime-error") {
        finish({ ok: false, errors: [message.error || "Generated app failed during staging"] });
        return;
      }
      // `ready` is sent after DOMContentLoaded, which means the bridge and
      // generated behavior scripts have loaded. Do not wait for animation
      // frames: browsers can throttle those in an off-screen staging iframe.
      if (message.type === "ready") {
        finish({ ok: true, value: { appId, html } });
      }
    };

    const timeoutId = setTimeout(() => {
      finish({ ok: false, errors: ["Generated app did not become ready in time"] });
    }, timeoutMs);

    window.addEventListener("message", onMessage);
    document.body.append(iframe);
    try {
      iframe.srcdoc = assemblePreviewDocument(html, { appId, sessionId, mode: "staging" });
    } catch (error) {
      finish({ ok: false, errors: [error instanceof Error ? error.message : String(error)] });
    }
  });
}
