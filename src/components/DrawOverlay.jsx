// DrawOverlay.jsx — canvas over the app iframe. Pointer Events + touch-action:none
// (THE demo-critical detail: mouse events alone = phone scrolls instead of draws).
// On finish: composites screenshot + ink, hit-tests the stroke centroid against
// the iframe's [data-component] elements, hands both to the parent.

import { useRef, useEffect } from "react";
import html2canvas from "html2canvas";

export default function DrawOverlay({ iframeRef, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const points = useRef([]);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    points.current.push(pos(e));
  };

  const move = (e) => {
    if (!drawing.current) return;
    const p = pos(e);
    const prev = points.current[points.current.length - 1];
    points.current.push(p);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const up = () => (drawing.current = false);

  async function finish() {
    if (points.current.length < 2) return onCancel();
    const pts = points.current;

    // 1. Hit-test: stroke centroid -> element inside the same-origin iframe.
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const doc = iframeRef.current.contentDocument;
    const el = doc.elementFromPoint(cx, cy);
    const component =
      el?.closest("[data-component]")?.getAttribute("data-component") || null;

    // 2. Screenshot the app, then draw the ink on top.
    const shot = await html2canvas(doc.body, {
      windowWidth: doc.body.clientWidth,
      scale: 1,
    });
    const out = document.createElement("canvas");
    out.width = shot.width;
    out.height = shot.height;
    const ctx = out.getContext("2d");
    ctx.drawImage(shot, 0, 0);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 4;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();

    onDone({ component, screenshotDataUrl: out.toDataURL("image/png") });
  }

  return (
    <div className="absolute inset-0 z-20">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        style={{ touchAction: "none" }} /* <- do not remove */
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
      />
      <div className="absolute top-3 inset-x-0 flex justify-center gap-2">
        <button
          onClick={finish}
          className="bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow"
        >
          Done drawing
        </button>
        <button
          onClick={onCancel}
          className="bg-white text-gray-600 text-sm px-4 py-2 rounded-full shadow"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
