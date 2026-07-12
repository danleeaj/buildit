// App.jsx — BuildIt shell: chat pane + phone-frame preview + draw-to-edit flow.
// State machine per PRD F5: PROBLEM -> propose, BUILD -> config+render,
// FEATURE -> regenerate config (H5: split config-vs-code), EDIT -> vision patch.

import { useState, useRef } from "react";
import DrawOverlay from "./components/DrawOverlay.jsx";
import { renderTracker } from "./lib/skeletons/tracker.js";
import {
  routeIntent,
  propose,
  generateConfig,
  editApp,
  applyBlocks,
} from "./lib/llm.js";

export default function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey! Tell me a problem you're dealing with — I'll build you an app for it." },
  ]);
  const [input, setInput] = useState("");
  const [html, setHtml] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [pendingDrawing, setPendingDrawing] = useState(null); // {component, screenshotDataUrl}
  const [shimmerTarget, setShimmerTarget] = useState(null);
  const iframeRef = useRef(null);

  const push = (role, content) =>
    setMessages((m) => [...m, { role, content }]);

  // History in Anthropic format (skip the greeting to save tokens).
  const history = () =>
    messages.slice(1).map(({ role, content }) => ({ role, content }));

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    push("user", text);
    setBusy(true);
    try {
      // A finished drawing waiting for its instruction takes priority.
      if (pendingDrawing) return await runEdit(text);

      const intent = await routeIntent(history(), text, !!html);
      if (intent === "PROBLEM") {
        push("assistant", await propose(history(), text));
      } else if (intent === "BUILD" || intent === "FEATURE") {
        const config = await generateConfig([...history(), { role: "user", content: text }]);
        setHtml(renderTracker(config));
        push("assistant", intent === "BUILD"
          ? `Done — ${config.appName} is live on the right. Try it! Tap the pencil to draw changes on it.`
          : `Updated ${config.appName}. Take a look.`);
      } else if (intent === "EDIT") {
        push("assistant", "Tap the pencil and circle the part you want changed — or just describe it and I'll do my best.");
        // TODO H5: handle text-only edits by sending a plain (unannotated) screenshot.
      } else {
        push("assistant", await propose(history(), text)); // CHAT fallback keeps momentum
      }
    } catch (err) {
      console.error(err);
      push("assistant", "Hmm, something glitched — try that again?");
    } finally {
      setBusy(false);
    }
  }

  async function runEdit(instruction) {
    const { component, screenshotDataUrl } = pendingDrawing;
    setPendingDrawing(null);
    setShimmerTarget(component);
    try {
      const blocks = await editApp({ html, screenshotDataUrl, component, instruction });
      if (Object.keys(blocks).length === 0) throw new Error("no blocks returned");
      setHtml((h) => applyBlocks(h, blocks)); // parse failure -> catch -> old html survives
      push("assistant", "Changed — how's that?");
    } catch (err) {
      console.error(err);
      push("assistant", "That edit didn't take — try circling it again or rephrasing.");
    } finally {
      setShimmerTarget(null);
      setBusy(false);
    }
  }

  function onDrawingDone(result) {
    setDrawMode(false);
    setPendingDrawing(result);
    push("assistant", `Got it — you circled the ${result.component || "app"}. What should I change?`);
  }

  return (
    <div className="h-screen flex text-zinc-100">
      {/* ---- Chat pane ---- */}
      <div className="w-96 flex flex-col border-r border-zinc-800">
        <div className="px-4 py-3 border-b border-zinc-800 font-bold tracking-tight">
          BuildIt
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-indigo-600"
                  : "bg-zinc-800"
              }`}
            >
              {m.content}
            </div>
          ))}
          {busy && <div className="text-zinc-500 text-sm animate-pulse">thinking…</div>}
        </div>
        <div className="p-3 border-t border-zinc-800 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={pendingDrawing ? "What should change here?" : "Describe your problem…"}
            className="flex-1 bg-zinc-800 rounded-full px-4 py-2.5 text-sm outline-none"
          />
          <button
            onClick={send}
            disabled={busy}
            className="bg-indigo-600 rounded-full px-4 text-sm font-semibold disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>

      {/* ---- Phone frame ---- */}
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="relative w-[390px] h-[780px] bg-black rounded-[3rem] p-3 shadow-2xl">
          <div className="relative w-full h-full rounded-[2.4rem] overflow-hidden bg-white">
            {html ? (
              <>
                <iframe
                  ref={iframeRef}
                  srcDoc={html}
                  title="preview"
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                />
                {shimmerTarget && (
                  <div className="absolute inset-0 bg-white/40 animate-pulse pointer-events-none" />
                )}
                {drawMode && (
                  <DrawOverlay
                    iframeRef={iframeRef}
                    onDone={onDrawingDone}
                    onCancel={() => setDrawMode(false)}
                  />
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
                Your app will appear here
              </div>
            )}
          </div>
          {html && !drawMode && (
            <button
              onClick={() => setDrawMode(true)}
              className="absolute -right-16 top-6 bg-zinc-800 hover:bg-zinc-700 rounded-full w-12 h-12 text-xl shadow"
              title="Draw on the app"
            >
              ✏️
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
