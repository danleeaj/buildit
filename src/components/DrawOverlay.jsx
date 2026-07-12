import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the app screenshot"));
    image.src = dataUrl;
  });
}

const DrawOverlay = forwardRef(function DrawOverlay({
  previewRef,
  onDone,
  onCancel,
  onError,
  error,
  hint = "Circle or underline the part you want to change.",
}, ref) {
  const canvasRef = useRef(null);
  const points = useRef([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.strokeStyle = "#e5484d";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
  }, []);

  const positionFor = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startDrawing = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    points.current.push(positionFor(event));
  };

  const continueDrawing = (event) => {
    if (!drawing.current) return;
    const point = positionFor(event);
    const previous = points.current.at(-1);
    points.current.push(point);
    if (!previous) return;
    const context = canvasRef.current.getContext("2d");
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasInk(true);
  };

  const stopDrawing = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    points.current = [];
    drawing.current = false;
    setHasInk(false);
  };

  async function captureDrawing() {
    if (points.current.length < 2) return null;
    if (!previewRef.current) throw new Error("The app preview is not ready yet.");

    const samples = points.current;
      const centroid = samples.reduce(
        (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
        { x: 0, y: 0 },
      );
      centroid.x /= samples.length;
      centroid.y /= samples.length;

      const [hit, capture] = await Promise.all([
        previewRef.current.hitTest(centroid.x, centroid.y),
        previewRef.current.capture(),
      ]);
      const image = await loadImage(capture.dataUrl);
      const output = document.createElement("canvas");
      output.width = capture.width;
      output.height = capture.height;
      const context = output.getContext("2d");
      context.drawImage(image, 0, 0, output.width, output.height);

      const overlayRect = canvasRef.current.getBoundingClientRect();
      const scaleX = output.width / overlayRect.width;
      const scaleY = output.height / overlayRect.height;
      context.strokeStyle = "#e5484d";
      context.lineWidth = 4 * Math.max(scaleX, scaleY);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      samples.forEach((point, index) => {
        const x = point.x * scaleX;
        const y = point.y * scaleY;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();

    return {
      component: hit.component,
      componentRect: hit.rect,
      screenshotDataUrl: output.toDataURL("image/png"),
    };
  }

  useImperativeHandle(ref, () => ({
    capture: captureDrawing,
    clear,
  }));

  async function finish() {
    if (!hasInk || !onDone) return;
    setFinishing(true);
    try {
      const drawingData = await captureDrawing();
      if (drawingData) onDone(drawingData);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="draw-overlay" aria-label="Draw on the app">
      <canvas
        ref={canvasRef}
        className="draw-canvas"
        aria-label="Drawing surface"
        style={{ touchAction: "none" }}
        onPointerDown={startDrawing}
        onPointerMove={continueDrawing}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
      />
      <div className="draw-controls">
        <button type="button" className="icon-action" onClick={onCancel} aria-label="Cancel drawing">
          Cancel
        </button>
        <button type="button" className="icon-action" onClick={clear} disabled={!hasInk || finishing}>
          Clear
        </button>
        {onDone && (
          <button
            type="button"
            className="primary-action compact"
            onClick={finish}
            disabled={!hasInk || finishing}
          >
            {finishing ? "Reading mark…" : "Use mark"}
          </button>
        )}
      </div>
      {error && <p className="draw-error" role="alert">{error}</p>}
      <p className="draw-hint">{hint}</p>
    </div>
  );
});

export default DrawOverlay;
