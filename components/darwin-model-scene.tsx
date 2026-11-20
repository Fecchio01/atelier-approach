'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { DarwinMode } from './darwin-companion';

type DarwinAsset = Awaited<ReturnType<GLTFLoader['loadAsync']>>;
type EyeState = { mesh: THREE.Mesh; scale: THREE.Vector3; position: THREE.Vector3 };

let darwinAsset: Promise<DarwinAsset> | null = null;

function loadDarwinAsset() {
  if (!darwinAsset) {
    let timeout = 0;
    const request = new GLTFLoader().loadAsync('/darwin/darwin-v8-mascot.glb');
    const loadTimeout = new Promise<never>((_resolve, reject) => {
      timeout = window.setTimeout(() => reject(new Error('O modelo 3D excedeu 30 segundos de carregamento.')), 30_000);
    });
    darwinAsset = Promise.race([request, loadTimeout])
      .catch((error: unknown) => {
        darwinAsset = null;
        throw error;
      })
      .finally(() => window.clearTimeout(timeout));
  }
  return darwinAsset;
}

function addModelOutlines(root: THREE.Object3D, geometries: THREE.BufferGeometry[], materials: THREE.Material[]) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !mesh.name.toLowerCase().includes('toon outline')) meshes.push(mesh);
  });

  meshes.forEach((mesh) => {
    const name = mesh.name.replaceAll('_', ' ').toLowerCase();
    if (!/darwin convex capsule shell|sculpted porcelain visor bezel|fine warm visor seam|convex forest glass visor|hand socket|green hand module|sprout leaf/.test(name)) return;
    const sourceGeometry = mesh.geometry;
    if (!sourceGeometry.boundingBox) sourceGeometry.computeBoundingBox();
    const bounds = sourceGeometry.boundingBox;
    if (!bounds || bounds.getSize(new THREE.Vector3()).length() < 0.08) return;

    const geometry = sourceGeometry.clone();
    const center = bounds.getCenter(new THREE.Vector3());
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      positions.setXYZ(
        index,
        center.x + (positions.getX(index) - center.x) * 1.014,
        center.y + (positions.getY(index) - center.y) * 1.014,
        center.z + (positions.getZ(index) - center.z) * 1.014,
      );
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      color: /visor|forest display/i.test(mesh.name) ? '#102817' : '#785332',
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    });
    const outline = new THREE.Mesh(geometry, material);
    outline.name = 'toon outline';
    outline.renderOrder = -1;
    mesh.add(outline);
    geometries.push(geometry);
    materials.push(material);
  });
}

function createLoupe(THREERef: typeof THREE, hand: THREE.Object3D, gradient: THREE.DataTexture) {
  const rig = new THREERef.Group();
  rig.name = 'Darwin research loupe';
  rig.scale.setScalar(1.35);

  const bronze = new THREERef.MeshToonMaterial({ color: '#bd713a', gradientMap: gradient });
  const gold = new THREERef.MeshToonMaterial({ color: '#edb45f', gradientMap: gradient });
  const green = new THREERef.MeshToonMaterial({ color: '#528248', gradientMap: gradient });
  const lens = new THREERef.MeshToonMaterial({ color: '#b8e8d2', transparent: true, opacity: 0.42, gradientMap: gradient, side: THREERef.DoubleSide });
  const grip = new THREERef.Mesh(new THREERef.SphereGeometry(0.075, 10, 8), green);
  grip.position.set(0.04, 0, 0.18);
  rig.add(grip);

  const lensCenter = new THREERef.Vector3(1.2, 0.3, 0.44);
  const handleStart = new THREERef.Vector3(0.04, 0, 0.18);
  const handleEnd = lensCenter.clone().add(new THREERef.Vector3(-0.15, -0.02, 0));
  const handleAxis = handleEnd.clone().sub(handleStart);
  const handle = new THREERef.Mesh(new THREERef.CylinderGeometry(0.042, 0.052, handleAxis.length(), 10), bronze);
  handle.position.copy(handleStart).add(handleEnd).multiplyScalar(0.5);
  handle.quaternion.setFromUnitVectors(new THREERef.Vector3(0, 1, 0), handleAxis.normalize());
  rig.add(handle);

  const rim = new THREERef.Mesh(new THREERef.TorusGeometry(0.34, 0.035, 8, 32), gold);
  rim.position.copy(lensCenter);
  rim.position.z += 0.018;
  rig.add(rim);
  const glass = new THREERef.Mesh(new THREERef.CircleGeometry(0.28, 36), lens);
  glass.position.copy(lensCenter);
  rig.add(glass);
  const glint = new THREERef.Mesh(new THREERef.SphereGeometry(0.018, 8, 6), new THREERef.MeshBasicMaterial({ color: '#f4fff8', toneMapped: false }));
  glint.position.copy(lensCenter).add(new THREERef.Vector3(-0.045, 0.055, 0.035));
  rig.add(glint);
  hand.add(rig);
  return rig;
}

export function DarwinModelScene({ mode, onUnavailable }: { mode: DarwinMode; onUnavailable: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const modeRef = useRef(mode);
  const visibleRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const modeChangedAtRef = useRef(performance.now());
  const applyAppearanceRef = useRef<(nextMode: DarwinMode) => void>(() => undefined);
  const applyAnimationRef = useRef<(nextMode: DarwinMode) => void>(() => undefined);
  const startAnimationRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    modeRef.current = mode;
    modeChangedAtRef.current = performance.now();
    applyAppearanceRef.current(mode);
    applyAnimationRef.current(mode);
    startAnimationRef.current();
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let actor: THREE.Group | null = null;
    let eyes: EyeState[] = [];
    const baseColors = new Map<THREE.Material, THREE.Color>();
    const outlineGeometries: THREE.BufferGeometry[] = [];
    const outlineMaterials: THREE.Material[] = [];
    const eyeMaterials: THREE.Material[] = [];
    const shellMaterials: THREE.Material[] = [];
    const bezelMaterials: THREE.Material[] = [];
    const visorMaterials: THREE.Material[] = [];
    let leftHand: THREE.Object3D | null = null;
    let leftHandBaseY = 0;
    let loupe: THREE.Group | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let targetNodes: THREE.Object3D[] = [];
    let gradient: THREE.DataTexture | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let nextFrameTimer = 0;
    let previousFrameAt = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerActive = false;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = reducedMotion.matches;

    const renderStatic = () => {
      if (renderer && scene && camera) renderer.render(scene, camera);
    };

    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (nextFrameTimer) window.clearTimeout(nextFrameTimer);
      frame = 0;
      nextFrameTimer = 0;
    };

    const modelCleanup = () => {
      mixer?.stopAllAction();
      if (mixer) mixer.uncacheRoot(mixer.getRoot());
      baseColors.forEach((_color, material) => material.dispose());
      outlineGeometries.forEach((geometry) => geometry.dispose());
      outlineMaterials.forEach((material) => material.dispose());
      loupe?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
      });
    };

    const scheduleNextFrame = (interval: number) => {
      nextFrameTimer = window.setTimeout(() => {
        nextFrameTimer = 0;
        frame = window.requestAnimationFrame(renderFrame);
      }, interval);
    };

    const renderFrame = (now: number) => {
      frame = 0;
      nextFrameTimer = 0;
      if (disposed || !renderer || !scene || !camera || !actor) return;
      const seconds = now / 1000;
      const elapsed = Math.max(0, (now - modeChangedAtRef.current) / 1000);
      const activeMode = modeRef.current;
      const attention = activeMode === 'attention';
      const thinking = activeMode === 'thinking' || activeMode === 'queued';
      const working = activeMode === 'working';
      const complete = activeMode === 'complete';
      const candidate = complete;
      const blinkCycle = (seconds + 0.3) % (working ? 4.1 : 4.5);
      const blink = reducedMotionRef.current ? 0 : blinkCycle < 0.19 ? Math.sin(Math.PI * blinkCycle / 0.19) : 0;
      const happyBounce = complete && elapsed < 0.62 ? Math.sin(Math.PI * elapsed / 0.62) : 0;
      const candidateNod = candidate && elapsed > 0.45 && elapsed < 1.2 ? Math.sin(Math.PI * (elapsed - 0.45) / 0.75) : 0;
      const breath = reducedMotionRef.current ? 0 : Math.sin(seconds * (working ? 4 : thinking ? 2.4 : 2)) * (working ? 0.025 : 0.016);

      actor.position.y = breath + happyBounce * 0.04 + candidateNod * 0.018;
      actor.rotation.y = working ? 0.3 + Math.sin(elapsed * 0.9) * 0.035 : thinking ? 0.03 : 0;
      actor.rotation.x = thinking ? (elapsed < 3.2 ? -0.09 : -0.015) : candidateNod * 0.045;
      actor.rotation.z = thinking ? -0.018 : complete ? happyBounce * 0.012 : working ? -0.01 : 0;
      actor.scale.setScalar(actor.userData.baseScale * (1 + happyBounce * 0.005));

      if (leftHand && working) {
        const phase = elapsed % 4.4;
        const descend = phase < 1.3 ? phase / 1.3 : phase < 2.8 ? 1 : phase < 4 ? 1 - (phase - 2.8) / 1.2 : 0;
        const smooth = descend * descend * (3 - 2 * descend);
        leftHand.position.y = leftHandBaseY - 0.16 * smooth;
      } else if (leftHand) leftHand.position.y = leftHandBaseY;
      if (loupe) loupe.rotation.z = 0;

      const gazeX = working && !reducedMotionRef.current ? 0.17 * Math.sin((elapsed % 4.8) / 4.8 * Math.PI * 2) : thinking ? 0.015 : 0;
      const gazeY = thinking ? 0.2 : 0;
      eyes.forEach(({ mesh, scale, position }) => {
        mesh.position.x = position.x + (pointerActive ? pointerX * 0.12 : gazeX);
        mesh.position.y = position.y + (pointerActive ? pointerY * 0.08 : gazeY);
        mesh.scale.set(scale.x, scale.y * (attention ? 1.18 : complete && elapsed < 0.42 ? 0.72 : 1 - blink * 0.94), scale.z);
      });

      const delta = previousFrameAt ? Math.min((now - previousFrameAt) / 1000, 0.12) : 0;
      previousFrameAt = now;
      mixer?.update(delta);
      renderStatic();

      const shouldAnimate = activeMode === 'idle' || activeMode === 'thinking' || activeMode === 'working'
        || activeMode === 'complete' && elapsed < 3;
      if (!reducedMotionRef.current && visibleRef.current && document.visibilityState === 'visible' && shouldAnimate) {
        scheduleNextFrame(activeMode === 'idle' ? 100 : 40);
      } else frame = 0;
    };

    const startAnimation = () => {
      if (disposed || frame || nextFrameTimer || reducedMotionRef.current || !visibleRef.current || document.visibilityState !== 'visible') return;
      frame = window.requestAnimationFrame(renderFrame);
    };
    startAnimationRef.current = startAnimation;

    const onMotionChange = () => {
      reducedMotionRef.current = reducedMotion.matches;
      stop();
      if (reducedMotionRef.current) pointerActive = false;
      if (!reducedMotionRef.current && visibleRef.current) {
        pointerActive = false;
        applyAnimationRef.current(modeRef.current);
        startAnimation();
      }
      else {
        mixer?.stopAllAction();
        if (actor) {
          actor.position.y = 0;
          actor.rotation.set(0, 0, 0);
          actor.scale.setScalar(actor.userData.baseScale);
        }
        if (leftHand) leftHand.position.y = leftHandBaseY;
        eyes.forEach(({ mesh, scale, position }) => {
          mesh.position.copy(position);
          mesh.scale.copy(scale);
        });
        renderStatic();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') stop();
      else if (!reducedMotionRef.current && visibleRef.current && !frame) startAnimation();
      else renderStatic();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotionRef.current || event.pointerType !== 'mouse') return;
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerX = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      pointerY = THREE.MathUtils.clamp(1 - ((event.clientY - rect.top) / rect.height) * 2, -1, 1);
      pointerActive = true;
      startAnimation();
    };
    const onPointerLeave = () => {
      if (!pointerActive) return;
      pointerActive = false;
      startAnimation();
    };

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor('#f8f3e8', 1);
      scene = new THREE.Scene();
      scene.background = new THREE.Color('#f8f3e8');
      camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      scene.add(new THREE.HemisphereLight(0xffe5c2, 0x527048, 1.35));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2);
      keyLight.position.set(-4, 7, 8);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xd7ffad, 0.5);
      fillLight.position.set(5, 0, 4);
      scene.add(fillLight);
    } catch (error) {
      renderer?.dispose();
      renderer?.forceContextLoss();
      if (process.env.NODE_ENV === 'development') console.error('[Darwin] Não foi possível iniciar o renderizador WebGL.', error);
      onUnavailable();
      return;
    }

    void loadDarwinAsset().then((gltf) => {
      if (disposed || !scene || !camera) return;
      const model = cloneSkeleton(gltf.scene);
      model.updateMatrixWorld(true);

      const palette = new Uint8Array([40, 40, 40, 255, 115, 115, 115, 255, 255, 255, 255, 255]);
      gradient = new THREE.DataTexture(palette, 3, 1, THREE.RGBAFormat);
      gradient.minFilter = THREE.NearestFilter;
      gradient.magFilter = THREE.NearestFilter;
      gradient.generateMipmaps = false;
      gradient.needsUpdate = true;

      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const originalMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const objectName = object.name.replaceAll('_', ' ').toLowerCase();
        mesh.material = originalMaterials.map((original) => {
          const materialName = `${original.name} ${objectName}`.toLowerCase();
          const originalColor = 'color' in original && original.color instanceof THREE.Color ? original.color.clone() : new THREE.Color('#f2d9b9');
          const color = originalColor;
          const material = materialName.includes('mint eyes')
            ? new THREE.MeshBasicMaterial({ color: '#92ffc0', toneMapped: false })
            : new THREE.MeshToonMaterial({ color, gradientMap: gradient! });
          if (materialName.includes('forest display')) material.color.set('#0b2615');
          if (materialName.includes('warm ivory shell')) material.color.set('#f7f7f2');
          if (materialName.includes('raised porcelain bezel')) material.color.set('#ffffff');
          if (materialName.includes('fine warm') || materialName.includes('fine warm screen seam')) material.color.set('#d5d3c9');
          if (materialName.includes('floating green') || materialName.includes('hand module')) material.color.set('#23723a');
          if (materialName.includes('sprout leaf')) material.color.offsetHSL(0, 0.12, 0.045);
          baseColors.set(material, material.color.clone());
          if (materialName.includes('mint eyes')) eyeMaterials.push(material);
          if (objectName.includes('darwin convex capsule shell') || objectName.includes('hand socket side volume')) shellMaterials.push(material);
          if (objectName.includes('sculpted porcelain visor bezel') || objectName.includes('hand socket porcelain lip')) bezelMaterials.push(material);
          if (objectName.includes('convex forest glass visor')) visorMaterials.push(material);
          return material;
        });
        if (objectName.includes('mint eye')) eyes.push({ mesh, scale: mesh.scale.clone(), position: mesh.position.clone() });
        if (objectName.includes('l floating green hand module')) leftHand = object;
        if (/^(touch target|target mark|target contact pulse)$/.test(objectName)) {
          object.visible = false;
          targetNodes.push(object);
        }
      });

      addModelOutlines(model, outlineGeometries, outlineMaterials);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3();
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && !/touch target|target mark|target contact pulse|toon outline/.test(mesh.name.toLowerCase())) bounds.expandByObject(mesh);
      });
      const center = bounds.getCenter(new THREE.Vector3());
      const dimensions = bounds.getSize(new THREE.Vector3());
      const baseScale = 4.25 / Math.max(dimensions.x, dimensions.y, dimensions.z);
      model.position.sub(center);

      const applyAppearance = (nextMode: DarwinMode) => {
        baseColors.forEach((color, material) => {
          if ('color' in material) (material as THREE.MeshToonMaterial).color.copy(color);
        });
        if (nextMode === 'attention') {
          visorMaterials.forEach((material) => { if ('color' in material) (material as THREE.MeshToonMaterial).color.set('#401716'); });
          eyeMaterials.forEach((material) => { if ('color' in material) (material as THREE.MeshBasicMaterial).color.set('#ff4135'); });
          shellMaterials.forEach((material) => { if ('color' in material) (material as THREE.MeshToonMaterial).color.set('#fff0ed'); });
          bezelMaterials.forEach((material) => { if ('color' in material) (material as THREE.MeshToonMaterial).color.set('#f8e7e3'); });
        }
      };
      applyAppearanceRef.current = (nextMode) => { applyAppearance(nextMode); renderStatic(); };
      applyAppearance(modeRef.current);

      mixer = new THREE.AnimationMixer(model);
      modeChangedAtRef.current = performance.now();
      const clipsByName = new Map(gltf.animations.map((clip) => [clip.name.toLowerCase(), clip]));
      const playClip = (needle: string, loop: boolean) => {
        const clip = [...clipsByName.entries()].find(([name]) => name.includes(needle))?.[1];
        if (!clip || !mixer) return;
        const action = mixer.clipAction(clip);
        action.reset();
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        action.clampWhenFinished = !loop;
        action.play();
      };
      applyAnimationRef.current = (nextMode) => {
        if (!mixer) return;
        mixer.stopAllAction();
        if (loupe) loupe.visible = nextMode === 'working';
        const celebrating = nextMode === 'complete';
        targetNodes.forEach((node) => { node.visible = celebrating; });
        if (reducedMotionRef.current) {
          mixer.update(0);
          renderStatic();
          return;
        }
        if (nextMode === 'working') playClip('l hand module highlightaction', true);
        if (celebrating) {
          playClip('l floating green hand moduleaction', false);
          playClip('target contact pulseaction', false);
          playClip('target markaction', false);
          playClip('touch targetaction', false);
        }
        mixer.update(0);
        renderStatic();
      };
      applyAnimationRef.current(modeRef.current);

      actor = new THREE.Group();
      actor.userData.baseScale = baseScale;
      actor.scale.setScalar(baseScale);
      actor.add(model);
      scene.add(actor);
      if (leftHand) {
        leftHandBaseY = leftHand.position.y;
        loupe = createLoupe(THREE, leftHand, gradient);
        loupe.visible = modeRef.current === 'working';
      }
      camera.position.z = 4.25 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.14;
      camera.lookAt(0, 0, 0);

      resizeObserver = new ResizeObserver(() => {
        if (!renderer || !camera || !host) return;
        const rect = host.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
        renderStatic();
      });
      resizeObserver.observe(host);
      if ('IntersectionObserver' in window) {
        intersectionObserver = new IntersectionObserver(([entry]) => {
          visibleRef.current = entry.isIntersecting;
          stop();
          if (entry.isIntersecting && !reducedMotionRef.current && document.visibilityState === 'visible') startAnimation();
          else renderStatic();
        });
        intersectionObserver.observe(host);
      } else {
        visibleRef.current = true;
        startAnimation();
      }

      renderStatic();
    }).catch((error: unknown) => {
      if (disposed) return;
      if (process.env.NODE_ENV === 'development') console.error('[Darwin] Não foi possível carregar public/darwin/darwin-v8-mascot.glb.', error);
      onUnavailable();
    });

    reducedMotion.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);
    return () => {
      disposed = true;
      stop();
      reducedMotion.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
      }
      modelCleanup();
      applyAppearanceRef.current = () => undefined;
      applyAnimationRef.current = () => undefined;
      startAnimationRef.current = () => undefined;
      gradient?.dispose();
    };
  }, [onUnavailable]);

  return <span ref={hostRef} className="block size-full overflow-hidden rounded-[inherit]" style={{ background: '#f8f3e8' }}>
    <canvas ref={canvasRef} className="block size-full" />
  </span>;
}
