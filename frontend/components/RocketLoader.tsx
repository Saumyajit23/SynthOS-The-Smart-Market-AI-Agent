"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface RocketLoaderProps {
  progress: number;
  thought?: string;
  isComplete?: boolean;
  companies?: string[]; // company names for satellite labels
}

export default function RocketLoader({ progress, thought, isComplete, companies }: RocketLoaderProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const frameRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());

const liveRef = useRef({
    progress: 0,
    earthMesh: null as THREE.Mesh | null,
    atmosphereMesh: null as THREE.Mesh | null,
    moonMesh: null as THREE.Mesh | null,
    rocketGroup: null as THREE.Group | null,
    satellites: [] as THREE.Group[],
    exhaustParticles: [] as THREE.Mesh[],
    stars: null as THREE.Points | null,
    asteroids: [] as THREE.Mesh[],
    starLayers: [] as THREE.Points[],
    isComplete: false, 
  });
  const isCompleteRef = useRef(false);
  isCompleteRef.current = isComplete ?? false;
  liveRef.current.progress = progress;
  liveRef.current.isComplete = isComplete ?? false;
  const companiesRef = useRef<string[]>([]);
  companiesRef.current = companies ?? [];

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ── Renderer ──────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 1);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Scene ─────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // ── Camera ────────────────────────────────────────────────────
    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.set(2, 5, 8);
    camera.lookAt(0, -2, 0);
    cameraRef.current = camera;

    // ── Lights ────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x334466, 2.5);
    scene.add(ambient);
    const sunLight = new THREE.DirectionalLight(0xffeedd, 3.5);
    sunLight.position.set(10, 8, 5);
    scene.add(sunLight);
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.8);
    fillLight.position.set(-5, -3, -5);
    scene.add(fillLight);

    // ── Starfield ─────────────────────────────────────────────────
    const starLayers = [
      { count: 300, size: 2.5, opacity: 1.0, spread: 500, color: 0xffffff },
      { count: 1000, size: 1.0, opacity: 0.9, spread: 500, color: 0xaaccff },
      { count: 5000, size: 0.4, opacity: 0.7, spread: 500, color: 0xffddaa },
    ];

    starLayers.forEach(({ count, size, opacity, spread, color }) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = spread * 0.2 + Math.random() * spread * 0.8;
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi);
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.computeBoundingSphere();

      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const cx = c.getContext("2d")!;
      
      const g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.1, "rgba(255,255,255,0.9)");
      g.addColorStop(0.4, "rgba(255,240,220,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      cx.fillStyle = g;
      cx.fillRect(0, 0, 128, 128);
      
      const g2 = cx.createRadialGradient(64, 64, 0, 64, 64, 10);
      g2.addColorStop(0, "rgba(255,255,255,1)");
      g2.addColorStop(1, "rgba(255,255,255,0)");
      cx.fillStyle = g2;
      cx.fillRect(0, 0, 128, 128);

      const mat = new THREE.PointsMaterial({
        color: color,
        size: size,
        sizeAttenuation: true,
        transparent: true,
        opacity: opacity,
        map: new THREE.CanvasTexture(c),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const field = new THREE.Points(geo, mat);
      field.frustumCulled = false;
      field.userData.rotSpeed = 0.00002 + Math.random() * 0.00004;
      field.userData.opacityBase = opacity;
      scene.add(field);
      liveRef.current.starLayers.push(field);
    });

    // ── Earth ─────────────────────────────────────────────────────
    const earthGeo = new THREE.SphereGeometry(8, 64, 64);
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load(
      "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg"
    );
    const earthMat = new THREE.MeshPhongMaterial({
      map: earthTexture,
      specular: new THREE.Color(0x333333),
      shininess: 15,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthMesh.position.set(-2, -6.5, 0);
    scene.add(earthMesh);
    liveRef.current.earthMesh = earthMesh;

    // ── Atmosphere glow ───────────────────────────────────────────
    const atmosGeo = new THREE.SphereGeometry(8.6, 64, 64);
    const atmosMat = new THREE.MeshPhongMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.15,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    atmosphere.position.copy(earthMesh.position);
    scene.add(atmosphere);
    liveRef.current.atmosphereMesh = atmosphere;

    // ── REALISTIC MOON WITH DETAILED CRATERS ────────────────────
    const moonGeo = new THREE.SphereGeometry(2.5, 64, 64); // Slightly smaller
    const moonMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: new THREE.Color(0x111111),
      shininess: 2,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    
    const moonTexture = textureLoader.load(
      "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg"
    );
    moonMat.map = moonTexture;
    moonMat.needsUpdate = true;
    
    // Position moon above Earth with safe distance
    moonMesh.position.set(4, 5.5, 8);
    scene.add(moonMesh);
    liveRef.current.moonMesh = moonMesh;

    // ── ASTEROIDS ──────────────────────────────────────────────────
    const asteroids: THREE.Mesh[] = [];
    const asteroidCount = 12;
    
    for (let i = 0; i < asteroidCount; i++) {
      const geo = new THREE.DodecahedronGeometry(
        0.08 + Math.random() * 0.15,
        0
      );
      
      const pos = geo.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        const y = pos.getY(v);
        const z = pos.getZ(v);
        const noise = 0.6 + Math.random() * 0.6;
        pos.setXYZ(v, x * noise, y * noise, z * noise);
      }
      geo.computeVertexNormals();

      const hue = 0.05 + Math.random() * 0.08;
      const saturation = 0.1 + Math.random() * 0.2;
      const lightness = 0.25 + Math.random() * 0.3;
      const color = new THREE.Color().setHSL(hue, saturation, lightness);
      
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7 + Math.random() * 0.25,
        metalness: 0.1 + Math.random() * 0.2,
      });
      const asteroid = new THREE.Mesh(geo, mat);

      const distance = 25 + Math.random() * 40;
      const angle = Math.random() * Math.PI * 2;
      const heightOffset = (Math.random() - 0.5) * 20;
      
      asteroid.position.set(
        Math.cos(angle) * distance,
        heightOffset * 0.3,
        Math.sin(angle) * distance * 0.35
      );

      asteroid.userData = {
        orbitAngle: angle,
        orbitSpeed: 0.00015 + Math.random() * 0.00035,
        orbitRadius: distance,
        heightOffset: heightOffset,
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 0.006,
          (Math.random() - 0.5) * 0.006,
          (Math.random() - 0.5) * 0.004,
        ),
        floatPhase: Math.random() * Math.PI * 2,
        floatSpeed: 0.04 + Math.random() * 0.08,
        floatAmount: 0.3 + Math.random() * 0.6,
      };

      scene.add(asteroid);
      asteroids.push(asteroid);
    }
    liveRef.current.asteroids = asteroids;

    // ── ROCKET ────────────────────────────────────────────────────
    const rocketGroup = new THREE.Group();
    scene.add(rocketGroup);
    liveRef.current.rocketGroup = rocketGroup;

    // Main body
    const bodyGeo = new THREE.CylinderGeometry(0.14, 0.18, 1.4, 32);
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0xe8e8e8,
      specular: 0xffffff,
      shininess: 120,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    rocketGroup.add(body);

    // Side boosters
    [-0.35, 0.35].forEach((xOffset) => {
      const boosterGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.9, 16);
      const boosterMat = new THREE.MeshPhongMaterial({
        color: 0xdddddd,
        specular: 0xffffff,
        shininess: 100,
      });
      const booster = new THREE.Mesh(boosterGeo, boosterMat);
      booster.position.set(xOffset, -0.25, 0);
      rocketGroup.add(booster);

      const boosterNoseGeo = new THREE.ConeGeometry(0.07, 0.25, 16);
      const boosterNose = new THREE.Mesh(boosterNoseGeo, boosterMat);
      boosterNose.position.set(xOffset, 0.25, 0);
      rocketGroup.add(boosterNose);

      const boosterExGeo = new THREE.SphereGeometry(0.07, 10, 10);
      const boosterExMat = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.8,
      });
      const boosterEx = new THREE.Mesh(boosterExGeo, boosterExMat);
      boosterEx.position.set(xOffset, -0.72, 0);
      rocketGroup.add(boosterEx);
    });

    // Nose cone
    const noseGeo = new THREE.ConeGeometry(0.14, 0.7, 32);
    const noseMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0xffffff,
      shininess: 150,
    });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.y = 1.05;
    rocketGroup.add(nose);

    // Orange stripes
    const stripe1Geo = new THREE.CylinderGeometry(0.145, 0.145, 0.1, 32);
    const stripeMat = new THREE.MeshPhongMaterial({ color: 0xff5500 });
    const stripe1 = new THREE.Mesh(stripe1Geo, stripeMat);
    stripe1.position.y = 0.3;
    rocketGroup.add(stripe1);

    const stripe2 = new THREE.Mesh(stripe1Geo, stripeMat);
    stripe2.position.y = -0.1;
    rocketGroup.add(stripe2);

    // Engine base
    const engineGeo = new THREE.CylinderGeometry(0.2, 0.16, 0.25, 32);
    const engineMat = new THREE.MeshPhongMaterial({
      color: 0x888888,
      specular: 0xffffff,
      shininess: 200,
    });
    const engine = new THREE.Mesh(engineGeo, engineMat);
    engine.position.y = -0.82;
    rocketGroup.add(engine);

    // Fins
    [-1, 1].forEach((side) => {
      [0, Math.PI / 2].forEach((rot) => {
        const finShape = new THREE.Shape();
        finShape.moveTo(0, 0);
        finShape.lineTo(side * 0.35, -0.5);
        finShape.lineTo(side * 0.15, -0.5);
        finShape.lineTo(0, -0.1);
        finShape.closePath();
        const finGeo = new THREE.ShapeGeometry(finShape);
        const finMat = new THREE.MeshPhongMaterial({
          color: 0xcc3300,
          side: THREE.DoubleSide,
          shininess: 60,
        });
        const fin = new THREE.Mesh(finGeo, finMat);
        fin.position.y = -0.65;
        fin.rotation.y = rot;
        if (rot === 0) fin.position.x = 0;
        else fin.position.z = 0;
        rocketGroup.add(fin);
      });
    });

    // Engine nozzle bell
    const nozzleGeo = new THREE.CylinderGeometry(0.1, 0.16, 0.2, 32);
    const nozzleMat = new THREE.MeshPhongMaterial({
      color: 0x666666,
      specular: 0xffffff,
      shininess: 180,
    });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.y = -1.02;
    rocketGroup.add(nozzle);

    // Exhaust glow
    const exhaustCoreGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const exhaustCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
    });
    const exhaustCore = new THREE.Mesh(exhaustCoreGeo, exhaustCoreMat);
    exhaustCore.position.y = -1.15;
    rocketGroup.add(exhaustCore);

    const exhaustHaloGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const exhaustHaloMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.7,
    });
    const exhaustHalo = new THREE.Mesh(exhaustHaloGeo, exhaustHaloMat);
    exhaustHalo.position.y = -1.15;
    rocketGroup.add(exhaustHalo);

    const trailGeo = new THREE.ConeGeometry(0.18, 1.2, 16);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.5,
    });
    const trailMesh = new THREE.Mesh(trailGeo, trailMat);
    trailMesh.position.y = -1.75;
    trailMesh.rotation.z = Math.PI;
    rocketGroup.add(trailMesh);

    const outerTrailGeo = new THREE.ConeGeometry(0.28, 1.8, 16);
    const outerTrailMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.2,
    });
    const outerTrail = new THREE.Mesh(outerTrailGeo, outerTrailMat);
    outerTrail.position.y = -2.0;
    outerTrail.rotation.z = Math.PI;
    rocketGroup.add(outerTrail);

    rocketGroup.position.set(6, 2, 0);
    rocketGroup.rotation.z = 0.3;
    rocketGroup.scale.setScalar(0.01);

    // ── Resize handler ────────────────────────────────────────────
    const onResize = () => {
      if (!container || !renderer || !camera) return;
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── Animation loop ────────────────────────────────────────────
    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      const t = clockRef.current.getElapsedTime();
      const live = liveRef.current;

      // ── ROCKET ANIMATION ──────────────────────────────────────
      if (live.rocketGroup) {
        const arcDuration = 5;
        const arcT = Math.min(t / arcDuration, 1);
        const eased = arcT < 0.5
          ? 2 * arcT * arcT
          : 1 - Math.pow(-2 * arcT + 2, 2) / 2;

        if (arcT < 1) {
          const p0 = { x: 7, y: -6 };
          const p1 = { x: 6, y: -1 };
          const p2 = { x: 1.8, y: 1.2 };
          const bx = (1-eased)*(1-eased)*p0.x + 2*(1-eased)*eased*p1.x + eased*eased*p2.x;
          const by = (1-eased)*(1-eased)*p0.y + 2*(1-eased)*eased*p1.y + eased*eased*p2.y;
          live.rocketGroup.position.x = bx;
          live.rocketGroup.position.y = by;
          live.rocketGroup.rotation.z = -0.15;
          const scaleT = Math.min(arcT * 2, 1);
          live.rocketGroup.scale.setScalar(0.01 + scaleT * 0.99);
        } else {
          const hoverT = Math.min((t - arcDuration) / 1.5, 1);
          const hoverEased = 1 - Math.pow(1 - hoverT, 3);
          if (!isCompleteRef.current) {
            live.rocketGroup.position.x = 1.8;
            live.rocketGroup.position.y = 1.2 + Math.sin(t * 1.5) * 0.06 * hoverEased;
            const currentRot = live.rocketGroup.rotation.z;
            live.rocketGroup.rotation.z = currentRot + (-0.15 - currentRot) * hoverEased * 0.1;
            live.rocketGroup.scale.setScalar(1);
            live.rocketGroup.userData.exitStartT = null;
          } else {
            if (!live.rocketGroup.userData.exitStartT) {
              live.rocketGroup.userData.exitStartT = t;
            }
            const exitStart = live.rocketGroup.userData.exitStartT;
            const exitAge = t - exitStart;
            let exitT = Math.min(exitAge / 2.5, 1);
            const swoosh = exitT * exitT * exitT;
            live.rocketGroup.position.x = 1.8 + swoosh * 2;
            live.rocketGroup.position.y = 1.2 + swoosh * 30;
            live.rocketGroup.rotation.z = -0.15 - swoosh * 0.2;
            live.rocketGroup.scale.set(
              Math.max(0.4, 1 - swoosh * 0.6),
              1 + swoosh * 6,
              Math.max(0.4, 1 - swoosh * 0.6)
            );
            if (exitT > 0.7) {
              const fadeT = (exitT - 0.7) / 0.3;
              live.rocketGroup.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                  const mesh = child as THREE.Mesh;
                  const mats = Array.isArray(mesh.material)
                    ? mesh.material : [mesh.material];
                  mats.forEach((mat: any) => {
                    mat.transparent = true;
                    mat.depthWrite = false;
                    mat.opacity = Math.max(0, 1 - fadeT);
                    mat.needsUpdate = true;
                  });
                }
              });
            }
          }
        }
      }

      // ── SATELLITE DEPLOYMENT ──────────────────────────────────
      if (live.rocketGroup) {
        const deployTimes = [8, 12, 16];
        deployTimes.forEach((deployT, i) => {
          if (t >= deployT && !live.satellites[i]) {
            const satGroup = new THREE.Group();
            const satBodyGeo = new THREE.BoxGeometry(0.18, 0.12, 0.12);
            const satBodyMat = new THREE.MeshPhongMaterial({
              color: 0xaaaacc,
              specular: 0xffffff,
              shininess: 120,
            });
            const satBody = new THREE.Mesh(satBodyGeo, satBodyMat);
            satGroup.add(satBody);

            [-1, 1].forEach((side) => {
              const panelGeo = new THREE.BoxGeometry(0.25, 0.06, 0.08);
              const panelMat = new THREE.MeshPhongMaterial({
                color: 0x2244aa,
                specular: 0x4488ff,
                shininess: 80,
              });
              const panel = new THREE.Mesh(panelGeo, panelMat);
              panel.position.x = side * 0.22;
              satGroup.add(panel);
            });

            const antennaGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.15, 8);
            const antennaMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
            const antenna = new THREE.Mesh(antennaGeo, antennaMat);
            antenna.position.y = 0.13;
            satGroup.add(antenna);

            const glowGeo = new THREE.SphereGeometry(0.15, 12, 12);
            const glowMat = new THREE.MeshBasicMaterial({
              color: 0x4488ff,
              transparent: true,
              opacity: 0.15,
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            satGroup.add(glow);
            
            // Company name label
            const labelCanvas = document.createElement("canvas");
            labelCanvas.width = 256;
            labelCanvas.height = 48;
            const lctx = labelCanvas.getContext("2d")!;
            lctx.clearRect(0, 0, 256, 48);
            lctx.fillStyle = "rgba(0,0,0,0)";
            lctx.fillRect(0, 0, 256, 48);
            const companyName = companiesRef.current[i] ?? `Satellite ${i + 1}`;
            lctx.font = "bold 18px Inter, sans-serif";
            lctx.fillStyle = "#88ccff";
            lctx.textAlign = "center";
            lctx.textBaseline = "middle";
            lctx.shadowColor = "#4488ff";
            lctx.shadowBlur = 8;
            lctx.fillText(companyName, 128, 24);
            const labelTex = new THREE.CanvasTexture(labelCanvas);
            const labelGeo = new THREE.PlaneGeometry(0.8, 0.15);
            const labelMat = new THREE.MeshBasicMaterial({
              map: labelTex,
              transparent: true,
              depthWrite: false,
            });
            const labelMesh = new THREE.Mesh(labelGeo, labelMat);
            labelMesh.position.set(0, 0.22, 0);
            satGroup.add(labelMesh);

            satGroup.position.copy(live.rocketGroup?.position ?? new THREE.Vector3(1.8, 1.2, 0));
            satGroup.userData = {
              deployTime: deployT,
              orbitAngle: (i / 3) * Math.PI * 2,
              orbitRadius: 2.5 + i * 0.5,
              orbitSpeed: 0.4 - i * 0.05,
              index: i,
            };
            sceneRef.current?.add(satGroup);
            live.satellites.push(satGroup);
          }
        });

        live.satellites.forEach((sat) => {
          const age = t - sat.userData.deployTime;
          const orbitDuration = 6;
          const rocketX = live.rocketGroup?.position.x ?? 1.8;
          const rocketY = live.rocketGroup?.position.y ?? 1.2;

          if (age < orbitDuration) {
            const settleT = Math.min(age / 1.5, 1);
            const settleEased = 1 - Math.pow(1 - settleT, 3);
            sat.userData.orbitAngle += sat.userData.orbitSpeed * 0.016;
            const targetX = rocketX + Math.cos(sat.userData.orbitAngle) * sat.userData.orbitRadius * settleEased;
            const targetY = rocketY + Math.sin(sat.userData.orbitAngle) * sat.userData.orbitRadius * 0.4 * settleEased;
            sat.position.x += (targetX - sat.position.x) * 0.08;
            sat.position.y += (targetY - sat.position.y) * 0.08;
            sat.userData.breakX = sat.position.x;
            sat.userData.breakY = sat.position.y;
          } else {
            const i = sat.userData.index;
            const descentAge = age - orbitDuration;
            const descentT = Math.min(descentAge / 14, 1);
            const descentEased = descentT * descentT;
            const startX = sat.userData.breakX ?? rocketX;
            const startY = sat.userData.breakY ?? rocketY;
            const ctrlX = startX - 0.5 + i * 0.8;
            const ctrlY = startY - 1.2 - i * 0.4;
            const hoverPositions = [
              { x: -3.5, y: -4.0 },   // close to Earth top
              { x: -4.5, y: -5.0 },   // closer to Earth side
              { x: -5.0, y: -6.0 },   // near Earth bottom curve
            ];
            const hover = hoverPositions[i] ?? hoverPositions[0];

            if (descentT < 1) {
              sat.position.x = (1-descentEased)*(1-descentEased)*startX +
                2*(1-descentEased)*descentEased*ctrlX +
                descentEased*descentEased*hover.x;
              sat.position.y = (1-descentEased)*(1-descentEased)*startY +
                2*(1-descentEased)*descentEased*ctrlY +
                descentEased*descentEased*hover.y;
            } else {
              const orbitAge = descentAge - 6;
              const orbitRadius = 0.3 + i * 0.1;
              const orbitSpeed = 0.6 + i * 0.15;
              sat.position.x = hover.x + Math.cos(orbitAge * orbitSpeed + i * 2) * orbitRadius;
              sat.position.y = hover.y + Math.sin(orbitAge * orbitSpeed + i * 2) * orbitRadius * 0.5;
            }
            const glowMesh = sat.children[3] as THREE.Mesh;
            if (glowMesh) {
              const mat = glowMesh.material as THREE.MeshBasicMaterial;
              if (mat) mat.opacity = 0.1 + Math.sin(t * 3 + i) * 0.08;
            }
          }
          sat.rotation.z += 0.015;
        });
      }

      // Exhaust pulse
      if (live.rocketGroup) {
        const exhaustPulse = 0.85 + Math.sin(t * 15) * 0.15;
        const core = live.rocketGroup.children[16] as THREE.Mesh;
        const halo = live.rocketGroup.children[17] as THREE.Mesh;
        const trail = live.rocketGroup.children[18] as THREE.Mesh;
        const outer = live.rocketGroup.children[19] as THREE.Mesh;
        if (core) core.scale.setScalar(exhaustPulse);
        if (halo) {
          halo.scale.setScalar(exhaustPulse * 1.2);
          (halo.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 10) * 0.2;
        }
        if (trail) {
          trail.scale.x = exhaustPulse * 0.9;
          trail.scale.z = exhaustPulse * 0.9;
          (trail.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(t * 8) * 0.15;
        }
        if (outer) {
          outer.scale.x = exhaustPulse;
          outer.scale.z = exhaustPulse;
          (outer.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(t * 6) * 0.08;
        }
      }

      // Earth animation
      if (live.earthMesh) {
        live.earthMesh.rotation.y = t * 0.04;
        const shrinkT = Math.min(t / 28, 1);
        live.earthMesh.position.x = -2 - shrinkT * 8;
        live.earthMesh.position.y = -5.5 - shrinkT * 12;
        live.earthMesh.position.z = shrinkT * -3;
        const earthScale = 1 - shrinkT * 0.6;
        live.earthMesh.scale.setScalar(earthScale);

        if (live.atmosphereMesh) {
          live.atmosphereMesh.position.copy(live.earthMesh.position);
          live.atmosphereMesh.scale.setScalar(earthScale);
        }

        // Moon follows Earth with safe distance
        if (live.moonMesh) {
          const moonOffset = new THREE.Vector3(4, 5.5, 8);
          const scaledOffset = moonOffset.clone().multiplyScalar(earthScale * 0.85);
          live.moonMesh.position.copy(live.earthMesh.position).add(scaledOffset);
          
          const moonScale = Math.max(0.35, earthScale * 0.75);
          live.moonMesh.scale.setScalar(moonScale);
          
          // Slow rotation to show detail
          live.moonMesh.rotation.y = t * 0.015;
          live.moonMesh.rotation.x = Math.sin(t * 0.008) * 0.02;
        }
      }

      // ── Star layer parallax + twinkle ─────────────────────────────
      live.starLayers.forEach((layer, i) => {
        layer.rotation.y += layer.userData.rotSpeed;
        layer.rotation.x += layer.userData.rotSpeed * 0.2;
        const mat = layer.material as THREE.PointsMaterial;
        const baseOpacity = layer.userData.opacityBase || [1.0, 0.9, 0.7][i] || 0.7;
        mat.opacity = baseOpacity * (0.85 + 0.15 * Math.sin(t * (0.2 + i * 0.2) + i * 1.5));
      });

      // ── Asteroid drift ────────────────────────────────────────
      live.asteroids.forEach((asteroid) => {
        asteroid.userData.orbitAngle += asteroid.userData.orbitSpeed;
        const radius = asteroid.userData.orbitRadius;
        const angle = asteroid.userData.orbitAngle;
        
        const floatOffset = Math.sin(t * asteroid.userData.floatSpeed + asteroid.userData.floatPhase) * asteroid.userData.floatAmount;
        
        asteroid.position.x = Math.cos(angle) * radius;
        asteroid.position.z = Math.sin(angle) * radius * 0.35;
        asteroid.position.y = asteroid.userData.heightOffset * 0.3 + floatOffset * 0.3;

        asteroid.rotation.x += asteroid.userData.rotSpeed.x;
        asteroid.rotation.y += asteroid.userData.rotSpeed.y;
        asteroid.rotation.z += asteroid.userData.rotSpeed.z;
      });

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
  }, []);

  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: "100%",
      background: "#000000",
      overflow: "hidden",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div ref={mountRef} style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
      }} />

      <div style={{
        position: "absolute",
        bottom: "2.5rem",
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.75rem",
        pointerEvents: "none",
      }}>
        <div style={{
          width: "min(400px, 80vw)",
          height: 3,
          background: "#111133",
          borderRadius: 2,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, #ff6600, #ff3300)",
            borderRadius: 2,
            transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: "0 0 8px #ff660088",
          }} />
        </div>
        {/* Thought text */}
        <div style={{
          fontSize: "0.8rem",
          color: "#8888cc",
          textAlign: "center",
          maxWidth: "min(480px, 85vw)",
        }}>
          <span style={{ color: "#ff6600", marginRight: "0.5rem" }}>●</span>
          {thought || "SynthOS preparing for launch..."}
        </div>

{/* Company chips — appear as companies are found */}
        {companies && companies.length > 0 && (
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.4rem",
            justifyContent: "center",
            maxWidth: "min(500px, 90vw)",
            paddingTop: "0.25rem",
          }}>
            {companies.map((name, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.2rem 0.65rem",
                borderRadius: 999,
                fontSize: "0.65rem",
                fontWeight: 600,
                letterSpacing: "0.04em",
                background: "rgba(255,102,0,0.1)",
                border: "1px solid rgba(255,102,0,0.35)",
                color: "#ff9944",
                transition: "all 0.4s ease",
              }}>
                <span style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#ff6600",
                  boxShadow: "0 0 6px #ff6600",
                  display: "inline-block",
                  flexShrink: 0,
                }} />
                {name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}