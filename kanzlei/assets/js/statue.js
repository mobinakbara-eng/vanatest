/* ==========================================================================
   Justitia – 3D-Statue (three.js), gesteuert durch die Scroll-Szene in main.js
   - Bronze-Material mit Umgebungsreflexionen
   - Drehung folgt dem Scrollen, weich gedämpft, dazu eine langsame Eigendrehung
   - Rendert nur, solange die Szene sichtbar ist
   Modell: "Lady Justice" von Kenny Maguire Studio, CC BY 4.0
   ========================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.querySelector('[data-canvas]');
const poster = document.querySelector('[data-poster]');
const MODEL_URL = (window.STATUE_MODEL_URL || 'assets/models/lady-justice.glb');

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}

if (canvas && webglOK()) init();

function init() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  // nahezu orthografische Kamera: Statue wirkt ruhig, Größe exakt steuerbar
  const FOV = 14, DIST = 12;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, DIST);
  const VIS_H = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2)); // sichtbare Höhe auf Ebene z=0

  const key = new THREE.DirectionalLight(0xffe2c4, 2.4); key.position.set(-4, 6, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6); rim.position.set(5, 3, -5); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a48, 0.5));

  const pivot = new THREE.Group();   // Position + Maßstab
  const spinner = new THREE.Group(); // Drehung
  pivot.add(spinner); scene.add(pivot);

  const bronze = new THREE.MeshStandardMaterial({ color: 0x6a4527, metalness: 0.85, roughness: 0.5, envMapIntensity: 1.0 });

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(MODEL_URL, (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => { if (o.isMesh) { o.material = bronze; o.castShadow = false; } });
    // auf Höhe 1 normieren, Fuß auf y = 0, mittig um die Drehachse
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 1 / size.y;
    model.scale.setScalar(s);
    model.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    spinner.add(model);
    resize();
    renderer.render(scene, camera);
    canvas.classList.add('is-ready');
    if (poster) poster.classList.add('is-hidden');
    start();
  }, undefined, () => { /* Modell nicht geladen: Poster bleibt sichtbar */ });

  let w = 0, h = 0;
  function resize() {
    w = canvas.clientWidth; h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // Sichtbarkeit: außerhalb der Szene nicht rendern
  let visible = true;
  const sceneEl = document.querySelector('[data-scene]');
  if (sceneEl && 'IntersectionObserver' in window) {
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) start(); }, { rootMargin: '100px' }).observe(sceneEl);
  }

  let rot = null, idle = 0, last = performance.now(), running = false, tiltX = 0, tiltTarget = 0;
  window.addEventListener('pointermove', (e) => { tiltTarget = ((e.clientY / window.innerHeight) - 0.5) * 0.06; }, { passive: true });

  function start() { if (!running && spinner.children.length) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

  function frame(now) {
    if (!visible) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const st = window.sceneState;
    const p = st ? st.p : 0;

    // Drehung: Scroll bestimmt den Großteil, dazu langsame Eigendrehung
    if (!reduce) idle += dt * 0.12;
    const target = -0.38 + p * Math.PI * 1.65 + idle;
    if (rot === null) rot = target;
    rot += (target - rot) * (1 - Math.pow(0.0015, dt));   // framerate-unabhängige Dämpfung
    spinner.rotation.y = rot;
    tiltX += (tiltTarget - tiltX) * 0.05;
    spinner.rotation.x = tiltX;

    // Position/Größe aus dem Layout der Szene (Anteile der Viewporthöhe)
    if (st) {
      const L = st.layout(p);
      const sc = L.h * VIS_H;
      pivot.scale.setScalar(sc);
      pivot.position.y = (0.5 - (L.t + L.h)) * VIS_H;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
}
