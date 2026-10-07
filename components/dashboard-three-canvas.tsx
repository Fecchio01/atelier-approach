'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function DashboardThreeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let frameId = 0;
    let running = false;
    let inViewport = false;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let updateVisibility: (() => void) | null = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10);
    camera.position.z = 2.8;

    const geometry: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const group = new THREE.Group();
    scene.add(group);

    const stop = () => {
      running = false;
      window.cancelAnimationFrame(frameId);
    };
    const cleanup = () => {
      stop();
      if (updateVisibility) document.removeEventListener('visibilitychange', updateVisibility);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      geometry.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      scene.clear();
      renderer?.dispose();
      renderer = null;
    };

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      renderer.setClearColor(0x000000, 0);

      const sphereGeometry = new THREE.SphereGeometry(0.34, 24, 16);
      const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2b18, emissive: 0x527516, emissiveIntensity: 0.28, roughness: 0.34, metalness: 0.45 });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      geometry.push(sphereGeometry);
      materials.push(sphereMaterial);
      group.add(sphere);

      const ringGeometry = new THREE.TorusGeometry(0.63, 0.025, 8, 48);
      const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xa7d81a, transparent: true, opacity: 0.7 });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = 0.82;
      ring.rotation.y = -0.28;
      geometry.push(ringGeometry);
      materials.push(ringMaterial);
      group.add(ring);

      const accentGeometry = new THREE.TorusGeometry(0.47, 0.009, 6, 48);
      const accentMaterial = new THREE.MeshBasicMaterial({ color: 0xe7eddf, transparent: true, opacity: 0.34 });
      const accent = new THREE.Mesh(accentGeometry, accentMaterial);
      accent.rotation.x = -0.68;
      accent.rotation.y = 0.55;
      geometry.push(accentGeometry);
      materials.push(accentMaterial);
      group.add(accent);

      scene.add(new THREE.HemisphereLight(0xe7f0da, 0x182018, 1.4));
      const keyLight = new THREE.DirectionalLight(0xe1f5bd, 2.2);
      keyLight.position.set(-2, 2, 3);
      scene.add(keyLight);

      const resize = () => {
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(bounds.width));
        const height = Math.max(1, Math.floor(bounds.height));
        renderer?.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      const render = (now: number) => {
        if (!running || !renderer) return;
        const seconds = now / 1000;
        group.rotation.y = seconds * 0.055;
        group.rotation.x = 0.12 + Math.sin(seconds * 0.12) * 0.035;
        renderer.render(scene, camera);
        frameId = window.requestAnimationFrame(render);
      };

      const start = () => {
        if (running || !inViewport || document.visibilityState !== 'visible') return;
        running = true;
        frameId = window.requestAnimationFrame(render);
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
      resize();

      intersectionObserver = new IntersectionObserver(([entry]) => {
        inViewport = entry.isIntersecting;
        if (inViewport) start();
        else stop();
      });
      intersectionObserver.observe(canvas);

      updateVisibility = () => document.visibilityState === 'visible' ? start() : stop();
      document.addEventListener('visibilitychange', updateVisibility);
      setReady(true);

      return cleanup;
    } catch {
      cleanup();
      return;
    }
  }, []);

  return <canvas data-testid="dashboard-scene-canvas" ref={canvasRef} className={`absolute inset-0 size-full rounded-full transition-opacity duration-200 ${ready ? 'opacity-100' : 'opacity-0'}`} tabIndex={-1} aria-hidden="true" />;
}
