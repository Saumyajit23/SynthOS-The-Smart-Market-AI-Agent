"use client";

import { useEffect, useRef } from "react";

export type AppState = "idle" | "brief" | "deep" | "generating" | "complete";

interface NeuralBackgroundProps {
  appState: AppState;
}

interface Node {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  phase: number;
  speed: number;
  opacity: number;
  size: number;
}

interface Particle {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
  color: string;
  trail: { x: number; y: number }[];
}

export default function NeuralBackground({ appState }: NeuralBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<{ a: number; b: number }[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const bootedRef = useRef(false);
  const appStateRef = useRef<AppState>("idle");
  const frameCountRef = useRef(0);
  const colorTransitionRef = useRef<number>(0);

  appStateRef.current = appState;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let width = 0;
    let height = 0;

    // ── Generate nodes ──────────────────────────────────────────
    const generateNodes = () => {
      const nodes: Node[] = [];
      const padding = 30;
      for (let i = 0; i < 220; i++) {
        const x = padding + Math.random() * (width - padding * 2);
        const y = padding + Math.random() * (height - padding * 2);
        nodes.push({
          x, y, baseX: x, baseY: y,
          phase: Math.random() * Math.PI * 2,
          speed: 0.002 + Math.random() * 0.004,
          opacity: 0,
          size: 1.5 + Math.random() * 2,
        });
      }
      return nodes;
    };

    // ── Generate edges ──────────────────────────────────────────
    const generateEdges = (nodes: Node[]) => {
      const edges: { a: number; b: number }[] = [];
      const DISTANCE = 140;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < DISTANCE) {
            edges.push({ a: i, b: j });
            if (edges.length > 2000) return edges;
          }
        }
      }
      return edges;
    };

    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      nodesRef.current = generateNodes();
      edgesRef.current = generateEdges(nodesRef.current);
      bootedRef.current = false;
      frameCountRef.current = 0;
      particlesRef.current = [];
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // ── Get colors based on app state ───────────────────────────
    const getColors = () => {
      const state = appStateRef.current;
      const isDeepMode = state === "deep" || state === "generating" || state === "complete";
      return {
        main: isDeepMode ? "#2979ff" : "#7c4dff",
        glow: isDeepMode ? "#3b82f6" : "#a855f7",
        particle: isDeepMode ? "#60a5fa" : "#b39dff",
        shadow: isDeepMode ? "#1a56db" : "#6d28d9",
      };
    };

    // ── Spawn particles with trails ─────────────────────────────
    const spawnParticle = () => {
      if (particlesRef.current.length > 60) return;
      const nodes = nodesRef.current;
      const idx1 = Math.floor(Math.random() * nodes.length);
      let idx2 = Math.floor(Math.random() * nodes.length);
      let attempts = 0;
      while (idx2 === idx1 && attempts < 10) {
        idx2 = Math.floor(Math.random() * nodes.length);
        attempts++;
      }
      const from = nodes[idx1];
      const to = nodes[idx2];
      if (from.opacity < 0.3 || to.opacity < 0.3) return;
      const dist = Math.sqrt(Math.pow(from.x - to.x, 2) + Math.pow(from.y - to.y, 2));
      if (dist < 30 || dist > 300) return;
      const colors = getColors();
      particlesRef.current.push({
        x: from.x, y: from.y,
        targetX: to.x, targetY: to.y,
        progress: 0,
        speed: 0.015 + Math.random() * 0.025,
        color: colors.particle,
        trail: [],
      });
    };

    // ── Spawn burst of particles ─────────────────────────────────
    const spawnBurst = () => {
      if (particlesRef.current.length > 55) return;
      const nodes = nodesRef.current;
      const activeNodes = nodes.filter(n => n.opacity > 0.5);
      if (activeNodes.length === 0) return;
      const center = activeNodes[Math.floor(Math.random() * activeNodes.length)];
      const colors = getColors();
      const count = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 50 + Math.random() * 100;
        const targetX = center.x + Math.cos(angle) * distance;
        const targetY = center.y + Math.sin(angle) * distance;
        let nearestNode = null;
        let nearestDist = Infinity;
        for (const node of nodes) {
          const d = Math.sqrt(Math.pow(node.x - targetX, 2) + Math.pow(node.y - targetY, 2));
          if (d < nearestDist && node.opacity > 0.3) {
            nearestDist = d;
            nearestNode = node;
          }
        }
        if (nearestNode) {
          particlesRef.current.push({
            x: center.x, y: center.y,
            targetX: nearestNode.x, targetY: nearestNode.y,
            progress: 0,
            speed: 0.02 + Math.random() * 0.03,
            color: colors.particle,
            trail: [],
          });
        }
      }
    };

    // ── Draw everything ──────────────────────────────────────────
    const drawFrame = (time: number) => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const colors = getColors();
      const targetColor = colors.main;

      ctx.fillStyle = "#060608";
      ctx.fillRect(0, 0, width, height);

      // ── Boot ──────────────────────────────────────────────────
      const BOOT_DURATION = 2.0;
      const bootT = Math.min(time / BOOT_DURATION, 1);

      if (!bootedRef.current) {
        if (bootT >= 1) bootedRef.current = true;
        nodes.forEach((node, i) => {
          const threshold = i / nodes.length;
          if (bootT > threshold) {
            const localT = Math.min((bootT - threshold) * nodes.length, 1);
            node.opacity = localT * 0.7;
          }
        });
      }

      // ── Update nodes ──────────────────────────────────────────
      const slowTime = time * 0.5;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (bootedRef.current && node.opacity < 0.7) {
          node.opacity += 0.008;
        }
        const drift = Math.sin(slowTime * node.speed + node.phase);
        node.x = node.baseX + drift * 5;
        node.y = node.baseY + Math.cos(slowTime * node.speed * 1.2 + node.phase) * 4;
      }

      // ── Draw edges ────────────────────────────────────────────
      const edgeAlpha = Math.min(bootT * 1.5, 1) * 0.12;
      if (edgeAlpha > 0.01) {
        for (let i = 0; i < edges.length; i++) {
          const edge = edges[i];
          const nodeA = nodes[edge.a];
          const nodeB = nodes[edge.b];
          if (!nodeA || !nodeB) continue;
          const opacity = Math.min(nodeA.opacity, nodeB.opacity) * edgeAlpha;
          if (opacity < 0.01) continue;
          ctx.globalAlpha = opacity;
          ctx.strokeStyle = targetColor;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(nodeA.x, nodeA.y);
          ctx.lineTo(nodeB.x, nodeB.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // ── Draw nodes ────────────────────────────────────────────
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.opacity < 0.02) continue;
        const size = node.size;
        const alpha = node.opacity;

        ctx.globalAlpha = alpha * 0.2;
        ctx.fillStyle = targetColor;
        ctx.shadowColor = targetColor;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(node.x, node.y, size * 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha * 0.8;
        ctx.shadowBlur = 0;
        ctx.fillStyle = targetColor;
        ctx.beginPath();
        ctx.arc(node.x, node.y, size * 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(node.x - size * 0.1, node.y - size * 0.1, size * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // ── Spawn particles ──────────────────────────────────────
      if (bootedRef.current) {
        frameCountRef.current++;
        if (frameCountRef.current % 2 === 0) spawnParticle();
        if (frameCountRef.current % 5 === 0) spawnBurst();
      }

      // ── Update and draw particles with trails ──────────────────
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.progress += p.speed;
        if (p.progress >= 1) {
          particlesRef.current.splice(i, 1);
          continue;
        }
        const x = p.x + (p.targetX - p.x) * p.progress;
        const y = p.y + (p.targetY - p.y) * p.progress;
        p.trail.push({ x, y });
        if (p.trail.length > 8) p.trail.shift();

        const alpha = Math.sin(p.progress * Math.PI) * 0.9;
        const size = 2.5 * (0.5 + 0.5 * Math.sin(p.progress * Math.PI));

        for (let t = 0; t < p.trail.length - 1; t++) {
          const trailAlpha = (t / p.trail.length) * alpha * 0.3;
          ctx.globalAlpha = trailAlpha;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = size * (t / p.trail.length) * 0.3;
          ctx.beginPath();
          ctx.moveTo(p.trail[t].x, p.trail[t].y);
          ctx.lineTo(p.trail[t + 1].x, p.trail[t + 1].y);
          ctx.stroke();
        }

        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(x, y, size * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha * 0.9;
        ctx.shadowBlur = 0;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x - size * 0.2, y - size * 0.2, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    };

    // ── Animation loop ──────────────────────────────────────────
    let lastFrameTime = 0;
    const TARGET_FPS = 60;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;

    const animate = (timestamp: number) => {
      const delta = timestamp - lastFrameTime;
      if (delta >= FRAME_INTERVAL) {
        lastFrameTime = timestamp - (delta % FRAME_INTERVAL);
        const time = timestamp / 1000;
        drawFrame(time);
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
        display: "block",
      }}
    />
  );
}