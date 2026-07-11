"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient "aeration tank" water scene for the sign-in brand panel: parallax
 * bubbles rising through water + slow-drifting light orbs, painted on a canvas
 * over the panel's gradient. Thematic for a wastewater-treatment product.
 * Self-contained (no libraries), DPR-aware, pauses when the tab is hidden, and
 * renders a single calm frame when the user prefers reduced motion.
 */
export function WaterCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = ref.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    // Bind to non-null-typed consts so the nested render closures keep the narrowing.
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;

    type Bubble = { x: number; y: number; r: number; speed: number; wob: number; wobSpeed: number; wobAmp: number; alpha: number };
    type Orb = { x: number; y: number; r: number; vx: number; vy: number; hue: number; alpha: number };
    let bubbles: Bubble[] = [];
    let orbs: Orb[] = [];

    function spawn(spread: boolean): Bubble {
      const layer = Math.random(); // 0 = far/small/slow, 1 = near/big/fast
      const r = 1.4 + layer * layer * 9;
      return {
        x: rand(0, w),
        y: spread ? rand(-20, h) : h + r + 4,
        r,
        speed: 0.12 + layer * 0.9,
        wob: rand(0, Math.PI * 2),
        wobSpeed: rand(0.008, 0.03),
        wobAmp: rand(3, 13),
        alpha: 0.06 + layer * 0.3,
      };
    }

    function init() {
      const count = Math.max(26, Math.min(72, Math.floor(w / 15)));
      bubbles = Array.from({ length: count }, () => spawn(true));
      orbs = Array.from({ length: 5 }, (_, i) => ({
        x: rand(0, w),
        y: rand(0, h),
        r: rand(130, 280),
        vx: rand(-0.14, 0.14),
        vy: rand(-0.1, 0.08),
        hue: i % 2 ? 152 : 205,
        alpha: rand(0.05, 0.13),
      }));
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      init();
    }

    function draw(animate: boolean) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "screen";
      for (const o of orbs) {
        if (animate) {
          o.x += o.vx;
          o.y += o.vy;
          if (o.x < -o.r) o.x = w + o.r;
          if (o.x > w + o.r) o.x = -o.r;
          if (o.y < -o.r) o.y = h + o.r;
          if (o.y > h + o.r) o.y = -o.r;
        }
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, `hsla(${o.hue}, 85%, 62%, ${o.alpha})`);
        g.addColorStop(1, `hsla(${o.hue}, 85%, 62%, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
      }

      ctx.globalCompositeOperation = "source-over";
      for (const b of bubbles) {
        if (animate) {
          b.y -= b.speed;
          b.wob += b.wobSpeed;
          if (b.y < -b.r) Object.assign(b, spawn(false));
        }
        const x = b.x + Math.sin(b.wob) * b.wobAmp;
        ctx.beginPath();
        ctx.arc(x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${b.alpha * 0.45})`;
        ctx.fill();
        ctx.lineWidth = Math.max(0.5, b.r * 0.14);
        ctx.strokeStyle = `rgba(255,255,255,${b.alpha})`;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x - b.r * 0.3, b.y - b.r * 0.32, Math.max(0.4, b.r * 0.24), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${b.alpha * 0.95})`;
        ctx.fill();
      }
    }

    function loop() {
      if (!running) return;
      draw(true);
      raf = requestAnimationFrame(loop);
    }

    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduce) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    }

    resize();
    if (reduce) {
      draw(false);
    } else {
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full" />;
}
