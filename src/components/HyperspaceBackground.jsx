import { useEffect, useRef } from "react";

const CRUISE_SPEED = 1.5;
const WORKLOAD_SPEED = 23;
const MAX_DEPTH = 960;
const FOCAL_LENGTH = 330;

function makeStar(width, height) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 64 + Math.random() * Math.max(width, height) * 1.1;
  const z = Math.random() * MAX_DEPTH;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z,
    previousZ: z,
  };
}

export default function HyperspaceBackground({ workload = false }) {
  const canvasRef = useRef(null);
  const workloadRef = useRef(workload);

  useEffect(() => {
    workloadRef.current = workload;
  }, [workload]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let stars = [];
    let frameId = null;
    let speed = CRUISE_SPEED;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      centerX = width / 2;
      centerY = height / 2;
      const count = Math.max(180, Math.min(420, Math.round((width * height) / 2900)));
      stars = Array.from({ length: count }, () => makeStar(width, height));
    };

    const draw = (isStatic = false) => {
      const targetSpeed = workloadRef.current && !isStatic ? WORKLOAD_SPEED : CRUISE_SPEED;
      speed += (targetSpeed - speed) * 0.045;
      const workloadAmount = Math.max(0, Math.min(1, (speed - CRUISE_SPEED) / (WORKLOAD_SPEED - CRUISE_SPEED)));

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#fcfcf9";
      context.fillRect(0, 0, width, height);

      for (const star of stars) {
        star.previousZ = star.z;
        if (!isStatic) star.z -= speed;
        if (star.z < 1) {
          Object.assign(star, makeStar(width, height));
          continue;
        }

        const projection = FOCAL_LENGTH / star.z;
        const x = centerX + star.x * projection;
        const y = centerY + star.y * projection;
        if (x < -40 || x > width + 40 || y < -40 || y > height + 40) continue;

        const depth = 1 - star.z / MAX_DEPTH;
        const size = 0.25 + depth * 1.65;
        const alpha = 0.38 + depth * 0.38;

        if (workloadAmount < 0.07 || isStatic) {
          context.beginPath();
          context.fillStyle = `rgb(20 20 18 / ${alpha})`;
          context.arc(x, y, size, 0, Math.PI * 2);
          context.fill();
          continue;
        }

        const previousProjection = FOCAL_LENGTH / star.previousZ;
        const previousX = centerX + star.x * previousProjection;
        const previousY = centerY + star.y * previousProjection;
        context.beginPath();
        context.strokeStyle = `rgb(20 20 18 / ${alpha + workloadAmount * 0.14})`;
        context.lineWidth = size;
        context.lineCap = "round";
        context.moveTo(previousX, previousY);
        context.lineTo(x, y);
        context.stroke();
      }
    };

    const animate = () => {
      draw();
      frameId = window.requestAnimationFrame(animate);
    };

    const updateMotionPreference = () => {
      window.cancelAnimationFrame(frameId);
      if (reducedMotion.matches) {
        speed = CRUISE_SPEED;
        draw(true);
      } else {
        animate();
      }
    };

    resize();
    updateMotionPreference();
    window.addEventListener("resize", resize);
    reducedMotion.addEventListener("change", updateMotionPreference);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      reducedMotion.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  return <canvas ref={canvasRef} className="hyperspace-background" aria-hidden="true" />;
}
