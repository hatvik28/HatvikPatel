import * as THREE from "three";

/* ════════════════════════════════════════════════════════════
   Hatvik Patel — The Great Hall of the Red Keep
   A stylized Game-of-Thrones throne room. Click the Iron Throne
   to travel to it and reveal the parchment info card.
   ════════════════════════════════════════════════════════════ */

const canvas = document.getElementById("hall");
const loader = document.getElementById("loader");
const hud = document.getElementById("hall-hud");
const fade = document.getElementById("fade");
const backdrop = document.getElementById("card-backdrop");
const returnBtn = document.getElementById("return-btn");

const START_POS = new THREE.Vector3(0, 6, 16);
let startYaw = 0, startPitch = 0;

let renderer, scene, camera;
let throneGroup, clickTarget;
const torchLights = [];
const flames = [];

let yaw = 0, pitch = 0;
let dragging = false, moved = 0, lastX = 0, lastY = 0;
let traveling = false, cardOpen = false;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/* ─────────────────────────  BUILD  ───────────────────────── */
function init() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    // No WebGL — skip straight to the card.
    fallbackToCard();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0712);
  scene.fog = new THREE.FogExp2(0x0a0712, 0.017);

  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.copy(START_POS);
  camera.lookAt(0, 4.5, -10);
  const e0 = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
  yaw = startYaw = e0.y;
  pitch = startPitch = e0.x;

  buildLighting();
  buildHall();
  buildThrone();

  bindEvents();
  animate();

  // Reveal once the first frames are drawn.
  setTimeout(() => loader.classList.add("hidden"), 500);
}

/* ─────────────────────────  LIGHTS  ──────────────────────── */
function buildLighting() {
  scene.add(new THREE.AmbientLight(0x40415a, 0.55));

  const hemi = new THREE.HemisphereLight(0x8a86b0, 0x140b06, 0.8);
  scene.add(hemi);

  // "Moonlight" through the windows — the one shadow caster.
  const dir = new THREE.DirectionalLight(0xdfe6ff, 1.4);
  dir.position.set(12, 32, 10);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  const c = dir.shadow.camera;
  c.left = -26; c.right = 26; c.top = 32; c.bottom = -32; c.near = 1; c.far = 90;
  dir.shadow.bias = -0.0005;
  scene.add(dir);

  // Dramatic warm wash on the throne.
  const spot = new THREE.SpotLight(0xffe6b0, 260, 70, 0.6, 0.55, 2);
  spot.position.set(0, 24, -4);
  spot.target.position.set(0, 5, -15);
  scene.add(spot);
  scene.add(spot.target);
}

/* ─────────────────────────  HALL  ────────────────────────── */
const HALF_W = 14;      // walls at x = ±14
const Z_DOOR = 30;      // door end
const Z_BACK = -24;     // throne wall
const CEIL = 30;
const LEN = Z_DOOR - Z_BACK;

function buildHall() {
  const stone = new THREE.MeshStandardMaterial({ color: 0x2b2c34, roughness: 0.92, metalness: 0.05 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x202129, roughness: 0.95 });

  // Floor — polished dark marble.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_W * 2, LEN),
    new THREE.MeshStandardMaterial({ color: 0x1d1f27, roughness: 0.28, metalness: 0.35 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (Z_DOOR + Z_BACK) / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Ceiling.
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, LEN), darkStone);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEIL, (Z_DOOR + Z_BACK) / 2);
  scene.add(ceil);

  // Side + end walls.
  const mkWall = (w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), stone);
  const zc = (Z_DOOR + Z_BACK) / 2;

  const left = mkWall(LEN, CEIL);
  left.rotation.y = Math.PI / 2;
  left.position.set(-HALF_W, CEIL / 2, zc);
  left.receiveShadow = true;
  scene.add(left);

  const right = mkWall(LEN, CEIL);
  right.rotation.y = -Math.PI / 2;
  right.position.set(HALF_W, CEIL / 2, zc);
  right.receiveShadow = true;
  scene.add(right);

  const back = mkWall(HALF_W * 2, CEIL);
  back.position.set(0, CEIL / 2, Z_BACK);
  back.receiveShadow = true;
  scene.add(back);

  const front = mkWall(HALF_W * 2, CEIL);
  front.rotation.y = Math.PI;
  front.position.set(0, CEIL / 2, Z_DOOR);
  scene.add(front);

  // Tall narrow windows on both side walls (glowing).
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x0b1024, emissive: 0x9fb8ff, emissiveIntensity: 1.6, roughness: 1
  });
  const winZ = [20, 11, 2, -7, -16];
  for (const z of winZ) {
    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 15), winMat);
      win.position.set(side * (HALF_W - 0.15), 15, z);
      win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(win);
      // arch cap
      const arch = new THREE.Mesh(new THREE.CircleGeometry(1.3, 16, 0, Math.PI), winMat);
      arch.position.set(side * (HALF_W - 0.15), 22.5, z);
      arch.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(arch);
    }
  }

  // Columns down both sides, with torches facing the carpet.
  for (const z of [22, 12, 2, -8]) {
    for (const side of [-1, 1]) {
      buildColumn(side * 11, z);
      buildTorch(side * (10.1), z, side);
    }
  }

  // Banners flanking the throne (deep Lannister-red).
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x5e1512, roughness: 0.9, side: THREE.DoubleSide });
  for (const x of [-5.5, 5.5]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(4, 16), bannerMat);
    banner.position.set(x, 16, Z_BACK + 0.3);
    scene.add(banner);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xb99a4a, metalness: 0.6, roughness: 0.4 }));
    trim.position.set(x, 24, Z_BACK + 0.35);
    scene.add(trim);
  }

  // Red carpet runner from doors to the dais.
  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 36),
    new THREE.MeshStandardMaterial({ color: 0x7a1f1c, roughness: 0.85 })
  );
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.02, 10);
  carpet.receiveShadow = true;
  scene.add(carpet);

  // Great doors at the entrance.
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3b2410, roughness: 0.8 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x7d5a25, metalness: 0.7, roughness: 0.4 });
  for (const dx of [-2.1, 2.1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(4, 16, 0.6), woodMat);
    door.position.set(dx, 8, Z_DOOR - 0.4);
    scene.add(door);
  }
  const doorRing = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 8, 20), bronzeMat);
  doorRing.position.set(-1.2, 8, Z_DOOR - 0.7);
  scene.add(doorRing);

  buildDais();
}

function buildColumn(x, z) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3b44, roughness: 0.85 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 26, 20), mat);
  shaft.position.set(x, 13, z);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  scene.add(shaft);
  const base = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 3), mat);
  base.position.set(x, 0.7, z);
  scene.add(base);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 3), mat);
  cap.position.set(x, 26, z);
  scene.add(cap);
}

function buildTorch(x, z, side) {
  const bracket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 })
  );
  bracket.position.set(x, 9, z);
  bracket.rotation.z = side * 0.5;
  scene.add(bracket);

  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffb24d })
  );
  flame.position.set(x - side * 0.4, 9.7, z);
  scene.add(flame);
  flames.push(flame);

  const light = new THREE.PointLight(0xff7a2c, 26, 26, 2);
  light.position.set(x - side * 0.4, 9.8, z);
  light.userData.base = 26;
  scene.add(light);
  torchLights.push(light);
}

function buildDais() {
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x161617, roughness: 0.95, flatShading: true });
  const steps = [
    { y: 0.5, z: -8.25, w: 10, h: 1 },
    { y: 1.0, z: -9.75, w: 11, h: 2 },
    { y: 1.5, z: -11.25, w: 12, h: 3 },
  ];
  for (const s of steps) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 1.5), stepMat);
    step.position.set(0, s.y, s.z);
    step.castShadow = true;
    step.receiveShadow = true;
    scene.add(step);
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 9.5), stepMat);
  platform.position.set(0, 1.5, -16);
  platform.castShadow = true;
  platform.receiveShadow = true;
  scene.add(platform);
}

/* ─────────────────────────  THRONE  ──────────────────────── */
function buildThrone() {
  throneGroup = new THREE.Group();
  throneGroup.position.set(0, 3, -15); // atop the platform

  const metal = new THREE.MeshStandardMaterial({
    color: 0x33343a, metalness: 0.95, roughness: 0.42, flatShading: true
  });

  const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, metal);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    throneGroup.add(m);
    return m;
  };

  // Massive base and seat.
  add(new THREE.BoxGeometry(4.4, 2.4, 3.2), 0, 1.2, 0);
  add(new THREE.BoxGeometry(4, 0.6, 3), 0, 2.7, 0);              // seat
  add(new THREE.BoxGeometry(4.2, 5.5, 0.6), 0, 5.4, -1.3);        // back slab
  add(new THREE.BoxGeometry(0.6, 1.4, 3), -1.9, 3.6, 0);          // left arm
  add(new THREE.BoxGeometry(0.6, 1.4, 3), 1.9, 3.6, 0);           // right arm

  // A crown of jagged swords bristling from the throne.
  const bladeGeo = new THREE.BoxGeometry(0.14, 1, 0.32);
  const rng = mulberry32(7);
  const anchors = [];
  // top edge of the backrest
  for (let i = 0; i < 22; i++) anchors.push({ x: -2 + (i / 21) * 4, y: 8.1, z: -1.3, spread: 1 });
  // sides
  for (let i = 0; i < 8; i++) anchors.push({ x: -2.1, y: 4.5 + i * 0.45, z: -1.1, spread: -1 });
  for (let i = 0; i < 8; i++) anchors.push({ x: 2.1, y: 4.5 + i * 0.45, z: -1.1, spread: 1 });

  for (const a of anchors) {
    const len = 1.6 + rng() * 3.4;
    const blade = new THREE.Mesh(bladeGeo, metal);
    blade.scale.y = len;
    blade.position.set(a.x + (rng() - 0.5) * 0.5, a.y + len * 0.4, a.z + (rng() - 0.5) * 0.4);
    blade.rotation.z = (rng() - 0.5) * 0.7 + a.spread * 0.15;
    blade.rotation.x = -0.2 - rng() * 0.5;
    blade.castShadow = true;
    throneGroup.add(blade);
    // pommel
    const pom = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), metal);
    pom.position.set(blade.position.x, a.y - 0.1, a.z + 0.1);
    throneGroup.add(pom);
  }

  // Invisible, generous click target so the throne is easy to select.
  clickTarget = new THREE.Mesh(
    new THREE.BoxGeometry(6.5, 11, 5),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  clickTarget.position.set(0, 4.5, -0.5);
  throneGroup.add(clickTarget);

  scene.add(throneGroup);
}

/* ─────────────────────────  CONTROLS  ────────────────────── */
function applyLook() {
  pitch = THREE.MathUtils.clamp(pitch, -0.62, 0.42);
  yaw = THREE.MathUtils.clamp(yaw, -2.4, 2.4);
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
}

function updatePointer(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
}

function hitThrone() {
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(throneGroup, true).length > 0;
}

function bindEvents() {
  canvas.addEventListener("pointerdown", (e) => {
    if (traveling || cardOpen) return;
    dragging = true; moved = 0;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    updatePointer(e.clientX, e.clientY);
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      yaw -= dx * 0.0026;
      pitch -= dy * 0.0026;
      applyLook();
      lastX = e.clientX; lastY = e.clientY;
    } else if (!traveling && !cardOpen) {
      canvas.classList.toggle("throne-hot", hitThrone());
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    if (dragging && moved < 7 && !traveling && !cardOpen) {
      updatePointer(e.clientX, e.clientY);
      if (hitThrone()) approach();
    }
    dragging = false;
  });

  returnBtn.addEventListener("click", returnToHall);

  // Card tabs.
  document.querySelectorAll(".stab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector(".stab.active").classList.remove("active");
      document.querySelector(".spanel.active").classList.remove("active");
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  window.addEventListener("resize", onResize);
}

/* ────────────────  TRAVEL TO THE THRONE  ─────────────────── */
function approach() {
  if (traveling || cardOpen) return;
  traveling = true;
  hud.classList.add("dim");
  canvas.classList.remove("throne-hot");

  const startPos = camera.position.clone();
  const endPos = new THREE.Vector3(0, 5.2, -3.5);
  const startQ = camera.quaternion.clone();
  const aim = camera.clone();
  aim.position.copy(endPos);
  aim.lookAt(0, 6, -15);
  const endQ = aim.quaternion.clone();

  const dur = 2600, t0 = performance.now();
  (function step(now) {
    let t = (now - t0) / dur;
    if (t > 1) t = 1;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(startPos, endPos, e);
    camera.quaternion.slerpQuaternions(startQ, endQ, e);
    if (t < 1) requestAnimationFrame(step);
    else openCard();
  })(t0);
}

function openCard() {
  fade.classList.add("on");
  setTimeout(() => {
    backdrop.classList.add("open");
    cardOpen = true;
  }, 850);
}

function returnToHall() {
  backdrop.classList.remove("open");
  setTimeout(() => {
    camera.position.copy(START_POS);
    yaw = startYaw; pitch = startPitch;
    applyLook();
    fade.classList.remove("on");
    hud.classList.remove("dim");
    cardOpen = false;
    traveling = false;
  }, 650);
}

function fallbackToCard() {
  loader.classList.add("hidden");
  hud.classList.add("dim");
  backdrop.classList.add("open");
  cardOpen = true;
  returnBtn.style.display = "none";
  document.querySelectorAll(".stab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector(".stab.active").classList.remove("active");
      document.querySelector(".spanel.active").classList.remove("active");
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

/* ─────────────────────────  LOOP  ────────────────────────── */
let frame = 0;
function animate() {
  requestAnimationFrame(animate);
  frame++;
  if (frame % 4 === 0) {
    for (const l of torchLights) l.intensity = l.userData.base * (0.72 + Math.random() * 0.5);
    const s = 0.85 + Math.random() * 0.35;
    for (const f of flames) f.scale.set(1, s, 1);
  }
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* small seeded RNG so the throne looks the same every load */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

init();
