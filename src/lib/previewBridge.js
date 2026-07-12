import html2canvasSource from "html2canvas/dist/html2canvas.min.js?raw";

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

function createBridgeRuntime({ sessionId, appId, mode }) {
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
          if (typeof window.html2canvas !== "function") throw new Error("Screenshot bridge unavailable");
          const canvas = await window.html2canvas(document.documentElement, {
            backgroundColor: "#ffffff",
            scale: 1,
            useCORS: false,
            logging: false,
            width: document.documentElement.clientWidth,
            height: window.innerHeight,
            windowWidth: document.documentElement.clientWidth,
            windowHeight: window.innerHeight,
            scrollX: 0,
            scrollY: -window.scrollY,
          });
          send("response", {
            requestId: message.requestId,
            ok: true,
            value: {
              dataUrl: canvas.toDataURL("image/png"),
              width: canvas.width,
              height: canvas.height,
              viewportWidth: document.documentElement.clientWidth,
              viewportHeight: window.innerHeight,
              scrollX: window.scrollX,
              scrollY: window.scrollY,
            },
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
      requestAnimationFrame(() => {
        send("heartbeat", { index: 1 });
        nativeSetTimeout(() => send("heartbeat", { index: 2 }), 250);
      });
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

  const captureLibrary = doc.createElement("script");
  captureLibrary.setAttribute("data-superflow-bridge-library", "html2canvas");
  captureLibrary.textContent = html2canvasSource;

  const bridge = doc.createElement("script");
  bridge.setAttribute("data-superflow-bridge", "true");
  bridge.textContent = createBridgeRuntime({ sessionId, appId, mode });

  doc.head.append(captureLibrary, bridge);
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
    let heartbeatCount = 0;
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
      if (message.type === "runtime-error") {
        finish({ ok: false, errors: [message.error || "Generated app failed during staging"] });
        return;
      }
      if (message.type === "heartbeat") {
        heartbeatCount += 1;
        if (heartbeatCount >= 2) finish({ ok: true, value: { appId, html } });
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
