/* ==========================================================================
   Justitia – 3D-Statue (three.js), gesteuert durch die Scroll-Szene in main.js
   - Bronze-Material mit Umgebungsreflexionen
   - Drehung folgt dem Scrollen, weich gedämpft
   - Lädt erst nach dem Seitenaufbau, rendert nur bei Bewegung
   Modell: "Lady Justice" von Kenny Maguire Studio, CC BY 4.0
   (vereinfacht, quantisiert und mit Meshopt komprimiert: 1,1 MB bzw. 0,56 MB fürs Handy)
   ========================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const canvas = document.querySelector('[data-canvas]');
const poster = document.querySelector('[data-poster]');
// Leichteres Modell für Handys bzw. Geräte mit wenig Speicher
const SMALL = window.innerWidth < 760 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const MODEL_URL = window.STATUE_MODEL_URL || (SMALL ? 'assets/models/lady-justice-mobile.glb' : 'assets/models/lady-justice.glb');

// Bei „Datensparmodus“ oder sehr langsamer Verbindung bleibt es beim Standbild
const conn = navigator.connection || {};
const SKIP_3D = conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}

// 3D erst laden, wenn die Seite fertig ist und der Browser Luft hat – das Standbild ist sofort da
function whenIdle(fn) {
  const go = () => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}
if (canvas && !SKIP_3D && webglOK()) whenIdle(init);

function init() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, SMALL ? 1.5 : 2);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
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
    // Normalen werden hier berechnet (spart Dateigröße, kein WebAssembly-Decoder nötig)
    model.traverse((o) => { if (o.isMesh) { if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); o.material = bronze; } });
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
  window.addEventListener('resize', () => { resize(); start(); });

  // Die Ebene ist fest im Hintergrund; Rendern stoppt automatisch, wenn nichts mehr passiert.
  const visible = true;

  let rot = null, idle = 0, last = performance.now(), running = false, tiltX = 0, tiltTarget = 0;
  window.addEventListener('pointermove', (e) => { tiltTarget = ((e.clientY / window.innerHeight) - 0.5) * 0.06; }, { passive: true });
  window.addEventListener('scroll', () => start(), { passive: true });

  function start() { if (!running && spinner.children.length) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

  let settled = 0, lastKey = '';
  function frame(now) {
    if (!visible) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const st = window.sceneState;
    const p = st ? st.p : 0;
    const q = st ? st.q : 0;

    // Drehung: über die ganze Szene eine halbe Umdrehung, weich gedämpft
    const target = -0.38 + Math.min(1, p / 0.8) * Math.PI + idle;   // halbe Drehung bis ~80 % der Szene
    if (rot === null) rot = target;
    const before = rot;
    rot += (target - rot) * (1 - Math.pow(0.004, dt));   // weich, framerate-unabhängig
    spinner.rotation.y = rot;
    tiltX += (tiltTarget - tiltX) * 0.05;
    spinner.rotation.x = tiltX * (1 - q);

    // Nur rendern, solange sich etwas bewegt – danach schläft die Schleife bis zum nächsten Scrollen
    const L0 = st ? st.layout(p) : null;
    const key = L0 ? L0.t.toFixed(4) + L0.h.toFixed(4) : '';
    if (Math.abs(rot - before) < 1e-5 && key === lastKey) {
      if (++settled > 2) { running = false; return; }
    } else settled = 0;
    lastKey = key;

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
