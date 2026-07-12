import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  PARENT_MESSAGE_SOURCE,
  PREVIEW_MESSAGE_SOURCE,
  assemblePreviewDocument,
  createPreviewSessionId,
} from "../lib/previewBridge.js";

const STORAGE_QUOTA_BYTES = 64 * 1024;
const STORAGE_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

function readBucket(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}") ?? {};
  } catch {
    return {};
  }
}

function bucketSize(bucket) {
  return new TextEncoder().encode(JSON.stringify(bucket)).byteLength;
}

const PreviewFrame = forwardRef(function PreviewFrame(
  {
    html,
    appId,
    mode = "live",
    className = "",
    title = "Generated app preview",
    onReady,
    onHeartbeat,
    onRuntimeError,
  },
  forwardedRef,
) {
  const iframeRef = useRef(null);
  const pendingRequestsRef = useRef(new Map());
  const ephemeralBucketRef = useRef({});
  const callbacksRef = useRef({ onReady, onHeartbeat, onRuntimeError });
  callbacksRef.current = { onReady, onHeartbeat, onRuntimeError };

  const sessionId = useMemo(
    () => createPreviewSessionId(),
    [html, appId, mode],
  );

  useEffect(() => {
    ephemeralBucketRef.current = {};
  }, [sessionId]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html || !appId) return undefined;

    const postToPreview = (message) => {
      iframe.contentWindow?.postMessage(
        {
          source: PARENT_MESSAGE_SOURCE,
          sessionId,
          ...message,
        },
        "*",
      );
    };

    const handleStorage = (message) => {
      const respond = (payload) =>
        postToPreview({
          type: "storage-result",
          requestId: message.requestId,
          ...payload,
        });

      try {
        if (!STORAGE_KEY_PATTERN.test(message.key || "")) {
          throw new Error("Storage key is invalid");
        }

        const storageKey = `superflow:generated:${appId}`;
        const bucket = mode === "live"
          ? readBucket(storageKey)
          : { ...ephemeralBucketRef.current };

        if (message.operation === "get") {
          respond({ ok: true, value: bucket[message.key] ?? null });
          return;
        }

        if (message.operation === "set") {
          bucket[message.key] = message.value;
        } else if (message.operation === "remove") {
          delete bucket[message.key];
        } else {
          throw new Error("Storage operation is invalid");
        }

        if (bucketSize(bucket) > STORAGE_QUOTA_BYTES) {
          throw new Error("This app has reached its local storage limit");
        }

        if (mode === "live") localStorage.setItem(storageKey, JSON.stringify(bucket));
        else ephemeralBucketRef.current = bucket;
        respond({ ok: true, value: true });
      } catch (error) {
        respond({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const onMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      const message = event.data;
      if (!message || message.source !== PREVIEW_MESSAGE_SOURCE || message.sessionId !== sessionId) return;

      if (message.type === "storage-request") {
        handleStorage(message);
        return;
      }

      if (message.type === "response") {
        const pending = pendingRequestsRef.current.get(message.requestId);
        if (!pending) return;
        pendingRequestsRef.current.delete(message.requestId);
        clearTimeout(pending.timeoutId);
        if (message.ok) pending.resolve(message.value);
        else pending.reject(new Error(message.error || "Preview request failed"));
        return;
      }

      if (message.type === "ready") callbacksRef.current.onReady?.();
      if (message.type === "heartbeat") callbacksRef.current.onHeartbeat?.(message.index);
      if (message.type === "runtime-error") {
        callbacksRef.current.onRuntimeError?.(message.error || "Generated app failed");
      }
    };

    window.addEventListener("message", onMessage);
    try {
      iframe.srcdoc = assemblePreviewDocument(html, { appId, sessionId, mode });
    } catch (error) {
      callbacksRef.current.onRuntimeError?.(
        error instanceof Error ? error.message : String(error),
      );
    }

    return () => {
      window.removeEventListener("message", onMessage);
      pendingRequestsRef.current.forEach(({ reject, timeoutId }) => {
        clearTimeout(timeoutId);
        reject(new Error("Preview was reloaded"));
      });
      pendingRequestsRef.current.clear();
    };
  }, [html, appId, mode, sessionId]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      get iframe() {
        return iframeRef.current;
      },
      sessionId,
      request(action, payload = {}, timeoutMs = 7000) {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return Promise.reject(new Error("Preview is unavailable"));
        const requestId = crypto.randomUUID();
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            pendingRequestsRef.current.delete(requestId);
            reject(new Error("Preview request timed out"));
          }, timeoutMs);
          pendingRequestsRef.current.set(requestId, { resolve, reject, timeoutId });
          iframe.contentWindow.postMessage(
            {
              source: PARENT_MESSAGE_SOURCE,
              sessionId,
              type: "request",
              requestId,
              action,
              ...payload,
            },
            "*",
          );
        });
      },
      hitTest(x, y) {
        return this.request("hit-test", { x, y });
      },
      capture() {
        return this.request("capture", {}, 12000);
      },
      ping() {
        return this.request("ping");
      },
    }),
    [sessionId],
  );

  return (
    <iframe
      ref={iframeRef}
      title={title}
      className={className}
      sandbox="allow-scripts"
    />
  );
});

export default PreviewFrame;
