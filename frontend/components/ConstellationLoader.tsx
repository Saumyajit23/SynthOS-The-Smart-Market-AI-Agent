"use client";

import { useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import type { DeepProgressState } from "../hooks/useDeepProgress";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ConstellationLoaderProps {
  state: DeepProgressState;
  progress: number; // 0–100
  onComplete?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  sun: 0x2979ff,
  sunGlow: 0x448aff,
  planetIdle: 0x4a4a6a,
  planetScanning: 0x7c4dff,
  planetDone: 0x00e676,
  ringBase: 0x8c64ff,
  connection: 0x2979ff,
  sectionPending: 0x2a2a4a,
  sectionActive: 0x7c4dff,
  sectionDone: 0x00e676,
  particle: 0xffffff,
};

const ORBIT_RADII = [2.8, 3.8, 4.7, 5.5, 6.2, 6.8, 7.3, 7.7, 8.0, 8.2];
const SECTION_LABELS = [
  "Market Overview",
  "Company Profiles",
  "Trends & Landscape",
  "Risk & Recommendation",
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ConstellationLoader({
  state,
  progress,
  onComplete,
}: ConstellationLoaderProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const frameRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());

  // Mutable state synced into the render loop without causing re-renders
  const liveRef = useRef({
    planets: [] as PlanetObject[],
    connections: [] as THREE.Line[],
    sectionMeshes: [] as THREE.Mesh[],
    particles: [] as ParticleSystem[],
    sunMesh: null as THREE.Mesh | null,
    sunHalo: null as THREE.Mesh | null,
    // Distant galaxy cluster (core, halo, orbiting dots)
    distantGalaxy: null as { core: THREE.Mesh; halo: THREE.Mesh; orbiters: THREE.Mesh[] } | null,
    state,
    progress,
    collapseStarted: false,
    collapseT: 0,
    meteors: [] as THREE.Line[], 
    nebulaClouds: [] as THREE.Points[],
  });

  // Sync latest state/progress into the live ref on every render
  liveRef.current.state = state;
  liveRef.current.progress = progress;

  // ── Scene initialisation ───────────────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // ✅ Deep black space
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.015); // ✅ Darker fog for space
    sceneRef.current = scene;

  // ── STARFIELD: Procedural twinkling stars ──────────────────────
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(3000);
    for (let i = 0; i < 3000; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 200;
      starPositions[i + 1] = (Math.random() - 0.5) * 200;
      starPositions[i + 2] = (Math.random() - 0.5) * 200;
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.computeBoundingSphere();
    
    // ── Soft blurred texture for nebula gas clouds ──────────────────
        const cloudCanvas = document.createElement("canvas");
        cloudCanvas.width = 128;
        cloudCanvas.height = 128;
        const cloudCtx = cloudCanvas.getContext("2d");
        if (cloudCtx) {
          const gradient = cloudCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
          gradient.addColorStop(0, "rgba(255,255,255,1)");
          gradient.addColorStop(0.3, "rgba(255,255,255,0.6)");
          gradient.addColorStop(0.6, "rgba(255,255,255,0.15)");
          gradient.addColorStop(1, "rgba(255,255,255,0)");
          cloudCtx.fillStyle = gradient;
          cloudCtx.fillRect(0, 0, 128, 128);
        }
        const cloudTexture = new THREE.CanvasTexture(cloudCanvas);

        // Create a small soft particle texture for stars to avoid undefined reference
        const particleCanvas = document.createElement("canvas");
        particleCanvas.width = 32;
        particleCanvas.height = 32;
        const pctx = particleCanvas.getContext("2d");
        if (pctx) {
          const pg = pctx.createRadialGradient(16, 16, 0, 16, 16, 16);
          pg.addColorStop(0, "rgba(255,255,255,1)");
          pg.addColorStop(1, "rgba(255,255,255,0)");
          pctx.fillStyle = pg;
          pctx.fillRect(0, 0, 32, 32);
        }
        const particleTexture = new THREE.CanvasTexture(particleCanvas);
        particleTexture.minFilter = THREE.LinearFilter;

        const starMaterial = new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.5,
          sizeAttenuation: true,
          transparent: true,
          opacity: 1.0,
          fog: false,
          map: particleTexture,
        });
    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.frustumCulled = false;
    scene.add(stars);

    // ── NEBULA CLOUDS: Particle-based gas clouds ──────────────────
    const nebulaGeometry = new THREE.BufferGeometry();
    const nebulaPositions = new Float32Array(900);
    for (let i = 0; i < 900; i += 3) {
      nebulaPositions[i] = (Math.random() - 0.5) * 120;
      nebulaPositions[i + 1] = (Math.random() - 0.5) * 120;
      nebulaPositions[i + 2] = (Math.random() - 0.5) * 120;
    }
    nebulaGeometry.setAttribute("position", new THREE.BufferAttribute(nebulaPositions, 3));
    nebulaGeometry.computeBoundingSphere();
    
    const nebulaMaterial = new THREE.PointsMaterial({
      color: 0x6a4c93,
      size: 0.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.12,
      fog: true,
      map: cloudTexture,  // ✅ Add this line
    });
    const nebula = new THREE.Points(nebulaGeometry, nebulaMaterial);
    nebula.frustumCulled = false;
    scene.add(nebula);

// ── COLORFUL NEBULA GAS CLOUDS: Clustered blurred formations ────
      const nebulaClusters = [
            // Pink/purple region — upper area
            { color: 0xff5599, x: 45, y: 15, z: -20, spreadX: 18, spreadY: 10, spreadZ: 15 },
            { color: 0xaa66ff, x: 50, y: 18, z: -16, spreadX: 15, spreadY: 8, spreadZ: 12 },
            
            // Cyan/teal region — side, elongated streak
            { color: 0x44aaff, x: -55, y: -5, z: 10, spreadX: 30, spreadY: 6, spreadZ: 10 },
            { color: 0x33ddcc, x: -50, y: -3, z: 14, spreadX: 25, spreadY: 5, spreadZ: 8 },
            
            // Gold/orange region — far side
            { color: 0xffcc44, x: 25, y: 20, z: 45, spreadX: 16, spreadY: 12, spreadZ: 14 },
            { color: 0xff8844, x: 28, y: 17, z: 48, spreadX: 14, spreadY: 10, spreadZ: 12 },
            
            // Green region — below, elongated streak
            { color: 0x66ff99, x: -20, y: -25, z: -30, spreadX: 28, spreadY: 8, spreadZ: 20 },
            { color: 0x44ffcc, x: -15, y: -22, z: -25, spreadX: 22, spreadY: 6, spreadZ: 16 },
            
            // Red region — below opposite side
            { color: 0xff4466, x: 30, y: -20, z: -10, spreadX: 20, spreadY: 9, spreadZ: 18 },
            { color: 0xff6688, x: 35, y: -18, z: -8, spreadX: 16, spreadY: 7, spreadZ: 14 },
          ];

    nebulaClusters.forEach((cluster) => {
          const cloudGeo = new THREE.BufferGeometry();
          const count = 55;
          const cloudPositions = new Float32Array(count * 3);

          for (let i = 0; i < count * 3; i += 3) {
            // Use per-axis spread for elongated/streaky non-uniform shapes
            cloudPositions[i] = cluster.x + (Math.random() - 0.5) * cluster.spreadX;
            cloudPositions[i + 1] = cluster.y + (Math.random() - 0.5) * cluster.spreadY;
            cloudPositions[i + 2] = cluster.z + (Math.random() - 0.5) * cluster.spreadZ;
          }

      cloudGeo.setAttribute("position", new THREE.BufferAttribute(cloudPositions, 3));
      cloudGeo.computeBoundingSphere();

      const cloudMat = new THREE.PointsMaterial({
        color: cluster.color,
        size: 9 + Math.random() * 5,       // ✅ Much bigger, soft blobs
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.25,
        map: cloudTexture,                  // ✅ Soft blurred texture
        blending: THREE.AdditiveBlending,   // ✅ Colors glow and merge
        depthWrite: false,                  // ✅ Prevents hard z-fighting edges
        fog: false,
      });

      const cloudMesh = new THREE.Points(cloudGeo, cloudMat);
      cloudMesh.frustumCulled = false;

      scene.add(cloudMesh);
      liveRef.current.nebulaClouds.push(cloudMesh);
    });

    // ── DISTANT CONSTELLATION PATTERNS: Faint connected star lines ──
    const constellationPatterns = [
      // RIGHT side — visible in photo 2 ✅ (keep similar distance)
      [
        { x: 70, y: -35, z: -50 },
        { x: 76, y: -28, z: -48 },
        { x: 82, y: -32, z: -52 },
        { x: 88, y: -25, z: -46 },
        { x: 84, y: -20, z: -50 },
      ],
      // LEFT side — visible in photo 2 ✅ (keep similar distance)
      [
        { x: -70, y: 40, z: -60 },
        { x: -62, y: 45, z: -58 },
        { x: -55, y: 38, z: -62 },
        { x: -48, y: 42, z: -55 },
      ],
      // FRONT LEFT — close, low angle
      [
        { x: -60, y: -20, z: 30 },
        { x: -54, y: -15, z: 28 },
        { x: -48, y: -20, z: 32 },
        { x: -42, y: -14, z: 29 },
      ],
      // FRONT RIGHT — close, low angle
      [
        { x: 60, y: -20, z: 30 },
        { x: 54, y: -15, z: 28 },
        { x: 48, y: -22, z: 32 },
        { x: 42, y: -14, z: 27 },
      ],
      // TOP CENTER — above the constellation
      [
        { x: 5, y: 55, z: -40 },
        { x: 12, y: 58, z: -38 },
        { x: 18, y: 53, z: -42 },
        { x: 12, y: 48, z: -40 },
      ],
      // BOTTOM LEFT — below and left
      [
        { x: -55, y: -45, z: -35 },
        { x: -49, y: -42, z: -33 },
        { x: -43, y: -46, z: -37 },
      ],
      // BOTTOM RIGHT — below and right
      [
        { x: 50, y: -45, z: -30 },
        { x: 56, y: -40, z: -28 },
        { x: 62, y: -45, z: -32 },
        { x: 56, y: -50, z: -30 },
      ],
    ];


    constellationPatterns.forEach((pattern) => {
      const points = pattern.map(p => new THREE.Vector3(p.x, p.y, p.z));

      
      // Draw faint connecting lines between consecutive stars
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x8899cc,
        transparent: true,
        opacity: 0.3,  // very faint
        fog: false,
      });
      const constellationLine = new THREE.Line(lineGeo, lineMat);
      scene.add(constellationLine);

      // Draw slightly brighter star points at each vertex
      const starGeo = new THREE.BufferGeometry().setFromPoints(points);
      starGeo.computeBoundingSphere();
      const starMat = new THREE.PointsMaterial({
        color: 0xaabbff,
        size: 1.4,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.75,
        map: particleTexture,
        fog: false,
      });
      const constellationStars = new THREE.Points(starGeo, starMat);
      constellationStars.frustumCulled = false;
      scene.add(constellationStars);
    });

          // ── DISTANT GALAXY SYSTEM: Glowing sphere far in the background ──
    const distantGalaxyGeo = new THREE.SphereGeometry(2.5, 16, 16);
    const distantGalaxyMat = new THREE.MeshBasicMaterial({
      color: 0xff9944,
      transparent: true,
      opacity: 0.35,
      fog: false,
    });
    const distantGalaxyCore = new THREE.Mesh(distantGalaxyGeo, distantGalaxyMat);
    distantGalaxyCore.position.set(-45, 15, -50);  // ✅ closer, visible past fog  
    scene.add(distantGalaxyCore);

    // Soft glow halo around the distant galaxy core
    const galaxyHaloGeo = new THREE.SphereGeometry(5, 16, 16);
    const galaxyHaloMat = new THREE.MeshBasicMaterial({
      color: 0xff7722,
      transparent: true,
      opacity: 0.08,
      fog: false,
    });
    const galaxyHalo = new THREE.Mesh(galaxyHaloGeo, galaxyHaloMat);
    galaxyHalo.position.copy(distantGalaxyCore.position);
    scene.add(galaxyHalo);

    // A few tiny orbiting points around the distant galaxy (like small satellite stars)
    const distantOrbitPoints: { angle: number; radius: number; speed: number }[] = [
      { angle: 0, radius: 6, speed: 0.15 },
      { angle: 2.1, radius: 8, speed: 0.1 },
      { angle: 4.2, radius: 7, speed: 0.12 },
    ];

    const distantOrbiters: THREE.Mesh[] = [];
    distantOrbitPoints.forEach((op) => {
      const dotGeo = new THREE.SphereGeometry(0.3, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0xaaccff,
        transparent: true,
        opacity: 0.6,
      });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.userData = { angle: op.angle, radius: op.radius, speed: op.speed };
      scene.add(dot);
      distantOrbiters.push(dot);
    });

    liveRef.current.distantGalaxy = { core: distantGalaxyCore, halo: galaxyHalo, orbiters: distantOrbiters };

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
    camera.position.set(0, 7, 18);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Lights
    const ambient = new THREE.AmbientLight(0x111133, 2);
    scene.add(ambient);
    const pointLight = new THREE.PointLight(0x2979ff, 8, 30);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    // Sun — the SynthOS core
    const sunGeo = new THREE.SphereGeometry(0.6, 32, 32);
    const sunMat = new THREE.MeshStandardMaterial({
      color: COLORS.sun,
      emissive: COLORS.sunGlow,
      emissiveIntensity: 2,
      roughness: 0,
      metalness: 0.5,
    });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sun);
    liveRef.current.sunMesh = sun;

    // Sun halo
    const haloGeo = new THREE.SphereGeometry(1.1, 32, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: COLORS.sunGlow,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    scene.add(halo);
    liveRef.current.sunHalo = halo;

    // Section label sprites (floating above orbital plane)
    const sectionMeshes: THREE.Mesh[] = [];
    SECTION_LABELS.forEach((label, i) => {
      const angle = (i / SECTION_LABELS.length) * Math.PI * 2 - Math.PI / 2;
      const r = 10.5;
      const geo = new THREE.PlaneGeometry(3.2, 0.5);
      const canvas = makeTextCanvas(label, COLORS.sectionPending);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.cos(angle) * r, 1.8, Math.sin(angle) * r);
      mesh.lookAt(camera.position);
      mesh.userData = { label, index: i, canvas, tex, angle };
      scene.add(mesh);
      sectionMeshes.push(mesh);
    });
    liveRef.current.sectionMeshes = sectionMeshes;

    // Resize handler
    const onResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Animation loop
    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      const t = clockRef.current.getElapsedTime();
      const live = liveRef.current;

      // Sun pulse
      if (live.sunMesh) {
        const pulse = 1 + Math.sin(t * 2.5) * 0.06;
        live.sunMesh.scale.setScalar(pulse);
        (live.sunMesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
          1.8 + Math.sin(t * 3) * 0.5;
      }
      if (live.sunHalo) {
        live.sunHalo.scale.setScalar(1 + Math.sin(t * 1.8) * 0.1);
        (live.sunHalo.material as THREE.MeshBasicMaterial).opacity =
          0.06 + Math.sin(t * 2.2) * 0.03;
      }

      // ── METEOR SHOOTING STARS ──────────────────────────────────
        // Occasionally spawn meteors streaking across space
        if (Math.random() < 0.03 && live.meteors.length < 6) {  // max 6 active meteors
          const startX = (Math.random() - 0.5) * 150;
          const startY = (Math.random() - 0.5) * 150;
          const startZ = -80;
          
          const endX = startX + (Math.random() - 0.5) * 80;
          const endY = startY + (Math.random() - 0.5) * 80;
          const endZ = startZ + 120;
          
          const meteorGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(startX, startY, startZ),
            new THREE.Vector3(endX, endY, endZ),
          ]);
          
          const meteorMat = new THREE.LineBasicMaterial({
            color: 0xffdd00,  // bright yellow meteor
            linewidth: 3,
            transparent: true,
            opacity: 0.8,
          });
          
          const meteorLine = new THREE.Line(meteorGeo, meteorMat);
          meteorLine.userData = {
            progress: 0,
            speed: 0.015 + Math.random() * 0.01,
            startPos: new THREE.Vector3(startX, startY, startZ),
            endPos: new THREE.Vector3(endX, endY, endZ),
          };
          
          scene.add(meteorLine);
          live.meteors.push(meteorLine);
        }
        
        // Update active meteors
        for (let i = live.meteors.length - 1; i >= 0; i--) {
          const meteor = live.meteors[i];
          meteor.userData.progress += meteor.userData.speed;
          
          if (meteor.userData.progress >= 1) {
            scene.remove(meteor);
            live.meteors.splice(i, 1);
          } else {
            const alpha = Math.sin(meteor.userData.progress * Math.PI);
            // meteor.material can be a Material or an array of Materials — handle both
            if (Array.isArray(meteor.material)) {
              meteor.material.forEach((m) => ((m as any).opacity = 0.8 * alpha));
            } else {
              (meteor.material as any).opacity = 0.8 * alpha;
            }
          }
        }

      // Orbit planets
      live.planets.forEach((p) => {
        const angle = p.startAngle + t * p.speed;
        const wobble = Math.sin(t * p.wobbleFreq + p.wobblePhase) * 0.15;
        p.mesh.position.set(
          Math.cos(angle) * p.radius,
          wobble,
          Math.sin(angle) * p.radius
        );
        if (p.ringGroup) {
          p.ringGroup.position.copy(p.mesh.position);
          p.ringGroup.rotation.x = Math.PI / 4 + Math.sin(t * 0.3) * 0.1;
          p.ringGroup.rotation.y = angle;
        }

        // Scanning pulse
        if (p.status === "scanning") {
          const glow = 1 + Math.sin(t * 6) * 0.2;
          p.mesh.scale.setScalar(glow);
          (p.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
            1.5 + Math.sin(t * 5) * 0.8;
        }
      });

      // ── Update distant galaxy orbiters ──────────────────────────
        if (live.distantGalaxy) {
          live.distantGalaxy.orbiters.forEach((dot) => {
            dot.userData.angle += dot.userData.speed * 0.016;
            const cx = live.distantGalaxy!.core.position.x;
            const cy = live.distantGalaxy!.core.position.y;
            const cz = live.distantGalaxy!.core.position.z;
            dot.position.set(
              cx + Math.cos(dot.userData.angle) * dot.userData.radius,
              cy,
              cz + Math.sin(dot.userData.angle) * dot.userData.radius
            );
          });
        }

      // Orbit section labels to always face camera
      live.sectionMeshes.forEach((m) => {
        m.lookAt(camera.position);
      });

      // Animate particles
      live.particles.forEach((ps) => ps.tick(t));

      // Slow scene rotation
      if (!live.collapseStarted) {
        scene.rotation.y = t * 0.04;
      }

      // Collapse animation
      if (live.collapseStarted) {
        live.collapseT += 0.025;
        const ct = Math.min(live.collapseT, 1);
        const scale = 1 - ct;
        live.planets.forEach((p) => {
          p.mesh.scale.setScalar(scale * (1 + Math.sin(t * 5) * 0.1));
          if (p.ringGroup) p.ringGroup.scale.setScalar(scale);
        });
        live.sectionMeshes.forEach((m) => {
          m.scale.setScalar(scale);
        });
        if (live.sunMesh) live.sunMesh.scale.setScalar(scale * 3);
        if (ct >= 1 && onComplete) {
          onComplete();
        }
      }

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── React to company_found events ─────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const live = liveRef.current;
    const { companies } = state;

    companies.forEach((company, i) => {
      if (live.planets[i]) return; // already spawned

      const radius = ORBIT_RADII[i] ?? 9;
      const startAngle = Math.random() * Math.PI * 2;
      const speed = 0.08 + i * 0.008;

      // Planet mesh
      const geo = new THREE.SphereGeometry(0.28, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS.planetScanning,
        emissive: COLORS.planetScanning,
        emissiveIntensity: 1.2,
        roughness: 0.3,
        metalness: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.cos(startAngle) * radius, 0, Math.sin(startAngle) * radius);
      mesh.scale.setScalar(0.01); // spawn small, scale up
      scene.add(mesh);

      // Orbit ring (faint dotted circle)
      const orbitPoints: THREE.Vector3[] = [];
      for (let a = 0; a <= Math.PI * 2; a += 0.15) {
        orbitPoints.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
      const orbitMat = new THREE.LineBasicMaterial({
        color: 0x333366,
        transparent: true,
        opacity: 0.3,
      });
      const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
      scene.add(orbitLine);

      // Ring group (data source rings, hidden until recon_done)
      const ringGroup = new THREE.Group();
      scene.add(ringGroup);

      const planet: PlanetObject = {
        mesh,
        orbitLine,
        ringGroup,
        radius,
        startAngle,
        speed,
        wobbleFreq: 0.5 + Math.random(),
        wobblePhase: Math.random() * Math.PI * 2,
        status: "scanning",
        name: company.name,
        rings: [],
      };
      live.planets.push(planet);

      // Animate spawn (scale up)
      let spawnT = 0;
      const spawnInterval = setInterval(() => {
        spawnT += 0.08;
        mesh.scale.setScalar(Math.min(spawnT, 1));
        if (spawnT >= 1) clearInterval(spawnInterval);
      }, 16);

      // Add data-source rings once company is found (4 rings, staggered)
      [0, 1, 2, 3].forEach((ri) => {
        setTimeout(() => {
          const rGeo = new THREE.TorusGeometry(0.45 + ri * 0.12, 0.015, 8, 64);
          const rMat = new THREE.MeshBasicMaterial({
            color: COLORS.ringBase,
            transparent: true,
            opacity: 0.5 - ri * 0.08,
          });
          const ring = new THREE.Mesh(rGeo, rMat);
          ring.rotation.x = Math.PI / 2;
          ringGroup.add(ring);
          planet.rings.push(ring);
        }, ri * 250 + 400);
      });

      // Label sprite
      addCompanyLabel(scene, company.name, mesh);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.companies.length]);

  // ── React to recon_done: mark planets done, draw connections ─────────────
  useEffect(() => {
    const scene = sceneRef.current;
    const live = liveRef.current;
    if (!scene || state.phase !== "analysis") return;

    live.planets.forEach((p) => {
      p.status = "done";
      (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(COLORS.planetDone);
      (p.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(COLORS.planetDone);
      (p.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
    });

    // Draw connection lines between adjacent planets
    const count = live.planets.length;
    for (let i = 0; i < count; i++) {
      const a = live.planets[i];
      const b = live.planets[(i + 1) % count];
      if (!a || !b) continue;
      const points = [a.mesh.position.clone(), b.mesh.position.clone()];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: COLORS.connection,
        transparent: true,
        opacity: 0.2,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      live.connections.push(line);

      // Travelling particle along each connection
      const ps = new ParticleSystem(scene, a.mesh.position, b.mesh.position);
      live.particles.push(ps);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // ── React to section completions ──────────────────────────────────────────
  useEffect(() => {
    const live = liveRef.current;
    state.sections.forEach((section) => {
      const mesh = live.sectionMeshes[section.index - 1];
      if (!mesh) return;
      const color =
        section.status === "done"
          ? COLORS.sectionDone
          : section.status === "active"
          ? COLORS.sectionActive
          : COLORS.sectionPending;
      const canvas = mesh.userData.canvas as HTMLCanvasElement;
      refreshTextCanvas(canvas, section.title, color);
      (mesh.userData.tex as THREE.CanvasTexture).needsUpdate = true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sections]);

  // ── Trigger collapse on complete ──────────────────────────────────────────
  useEffect(() => {
    if (state.phase === "complete") {
      liveRef.current.collapseStarted = true;
    }
  }, [state.phase]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER (HTML overlay on top of the canvas)
  // ─────────────────────────────────────────────────────────────────────────

  const phaseLabel = useMemo(() => {
    switch (state.phase) {
      case "recon": return "RECON";
      case "analysis": return "ANALYSIS";
      case "synthesis": return "SYNTHESIS";
      case "complete": return "COMPLETE";
      default: return "INITIALISING";
    }
  }, [state.phase]);

  const phaseIndex = useMemo(() => {
    const map: Record<string, number> = { recon: 0, analysis: 1, synthesis: 2, complete: 2 };
    return map[state.phase] ?? 0;
  }, [state.phase]);

  return (
    <div className="synthos-constellation" style={containerStyle}>
      {/* Three.js canvas mount */}
      <div ref={mountRef} style={canvasStyle} />

      {/* Overlay UI */}
      <div style={overlayStyle}>

        {/* Phase indicator */}
        <div style={phaseBarStyle}>
          {["RECON", "ANALYSIS", "SYNTHESIS"].map((label, i) => (
            <div key={label} style={phaseSegmentStyle(i, phaseIndex)}>
              <span style={phaseDotStyle(i, phaseIndex)} />
              {label}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={progressTrackStyle}>
          <div style={progressFillStyle(progress)} />
        </div>
        <div style={progressLabelStyle}>{progress}%</div>

        {/* Thought stream */}
        <div style={thoughtStyle}>
          <span style={thoughtDotStyle}>●</span>
          {state.thought || "Initialising neural pathways..."}
        </div>

        {/* Company chips */}
        {state.companies.length > 0 && (
          <div style={chipsContainerStyle}>
            {state.companies.map((c) => (
              <div
                key={c.name}
                style={chipStyle(c.status)}
                title={c.description}
              >
                <span style={chipDotStyle(c.status)} />
                {c.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL THREE.JS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

interface PlanetObject {
  mesh: THREE.Mesh;
  orbitLine: THREE.LineLoop;
  ringGroup: THREE.Group;
  radius: number;
  startAngle: number;
  speed: number;
  wobbleFreq: number;
  wobblePhase: number;
  status: "found" | "scanning" | "done";
  name: string;
  rings: THREE.Mesh[];
}

class ParticleSystem {
  private mesh: THREE.Mesh;
  private from: THREE.Vector3;
  private to: THREE.Vector3;
  private t: number;
  private speed: number;

  constructor(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3) {
    this.from = from.clone();
    this.to = to.clone();
    this.t = Math.random();
    this.speed = 0.3 + Math.random() * 0.3;
    const geo = new THREE.SphereGeometry(0.04, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.particle,
      transparent: true,
      opacity: 0.8,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    scene.add(this.mesh);
  }

  tick(_time: number) {
    this.t += this.speed * 0.016;
    if (this.t > 1) this.t -= 1;
    this.mesh.position.lerpVectors(this.from, this.to, this.t);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity =
      Math.sin(this.t * Math.PI) * 0.9;
  }
}

function makeTextCanvas(text: string, color: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 80;
  refreshTextCanvas(canvas, text, color);
  return canvas;
}

function refreshTextCanvas(canvas: HTMLCanvasElement, text: string, color: number) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const hex = "#" + color.toString(16).padStart(6, "0");
  ctx.fillStyle = hex;
  ctx.font = "bold 22px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = hex;
  ctx.shadowBlur = 10;
  ctx.fillText(text, 256, 40);
}

function addCompanyLabel(scene: THREE.Scene, name: string, target: THREE.Mesh) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 48;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = "#aaaadd";
  ctx.font = "14px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, 128, 24);
  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(1.4, 0.28);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(target.position).add(new THREE.Vector3(0, 0.55, 0));
  // Parent to target so label follows planet
  target.add(mesh);
  mesh.position.set(0, 0.55, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES (inline — no Tailwind dependency for this isolated component)
// ─────────────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  background: "radial-gradient(ellipse at 50% 40%, #0d0d2b 0%, #050510 100%)",
  overflow: "hidden",
  fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
};

const canvasStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-end",
  paddingBottom: "2.5rem",
  gap: "0.75rem",
  pointerEvents: "none",
};

const phaseBarStyle: React.CSSProperties = {
  display: "flex",
  gap: "2rem",
  fontSize: "0.65rem",
  fontWeight: 700,
  letterSpacing: "0.15em",
  color: "#555588",
  marginBottom: "0.25rem",
};

const phaseSegmentStyle = (i: number, current: number): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  color: i < current ? "#00e676" : i === current ? "#7c4dff" : "#334",
  transition: "color 0.5s ease",
});

const phaseDotStyle = (i: number, current: number): React.CSSProperties => ({
  display: "inline-block",
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: i < current ? "#00e676" : i === current ? "#7c4dff" : "#334",
  boxShadow: i === current ? "0 0 8px #7c4dff" : "none",
  transition: "background 0.5s ease, box-shadow 0.5s ease",
});

const progressTrackStyle: React.CSSProperties = {
  width: "min(400px, 80vw)",
  height: 3,
  background: "#111133",
  borderRadius: 2,
  overflow: "hidden",
};

const progressFillStyle = (p: number): React.CSSProperties => ({
  height: "100%",
  width: `${p}%`,
  background: "linear-gradient(90deg, #2979ff, #7c4dff)",
  borderRadius: 2,
  transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
  boxShadow: "0 0 8px #7c4dff88",
});

const progressLabelStyle: React.CSSProperties = {
  fontSize: "0.65rem",
  color: "#445",
  letterSpacing: "0.1em",
  fontVariantNumeric: "tabular-nums",
  marginTop: "-0.25rem",
};

const thoughtStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "0.8rem",
  color: "#8888cc",
  maxWidth: "min(480px, 85vw)",
  textAlign: "center",
  minHeight: "1.4em",
  transition: "opacity 0.4s ease",
  lineHeight: 1.5,
};

const thoughtDotStyle: React.CSSProperties = {
  fontSize: "0.45rem",
  color: "#7c4dff",
  flexShrink: 0,
  animation: "synthosPulse 1.8s ease-in-out infinite",
};

const chipsContainerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
  justifyContent: "center",
  maxWidth: "min(600px, 90vw)",
  paddingTop: "0.25rem",
};

const chipStyle = (status: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "0.3rem",
  padding: "0.2rem 0.65rem",
  borderRadius: 999,
  fontSize: "0.65rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  background:
    status === "done"
      ? "rgba(0,230,118,0.1)"
      : status === "scanning"
      ? "rgba(124,77,255,0.12)"
      : "rgba(255,255,255,0.04)",
  border: `1px solid ${
    status === "done"
      ? "rgba(0,230,118,0.3)"
      : status === "scanning"
      ? "rgba(124,77,255,0.35)"
      : "rgba(255,255,255,0.08)"
  }`,
  color:
    status === "done" ? "#00e676" : status === "scanning" ? "#9c6fff" : "#666699",
  transition: "all 0.4s ease",
});

const chipDotStyle = (status: string): React.CSSProperties => ({
  width: 5,
  height: 5,
  borderRadius: "50%",
  background:
    status === "done" ? "#00e676" : status === "scanning" ? "#7c4dff" : "#444466",
  boxShadow: status === "scanning" ? "0 0 6px #7c4dff" : "none",
  flexShrink: 0,
});