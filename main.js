import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

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

let renderer, scene, camera, composer;
let throneGroup, clickTarget;
const torchLights = [];
const flames = [];

let yaw = 0, pitch = 0;
let dragging = false, moved = 0, lastX = 0, lastY = 0;
let traveling = false, cardOpen = false;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const texLoader = new THREE.TextureLoader();

/* ─────────────────────  TEXTURE HELPERS  ─────────────────── */
function pbr(base, repeatX, repeatY) {
  const maps = {};
  const load = (suffix, colorSpace) => {
    const t = texLoader.load(`assets/textures/${base}_${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    if (colorSpace) t.colorSpace = colorSpace;
    t.anisotropy = 8;
    return t;
  };
  maps.map = load("diff", THREE.SRGBColorSpace);
  maps.normalMap = load("nor_gl");
  maps.roughnessMap = load("rough");
  return maps;
}

/* ─────────────────────────  BUILD  ───────────────────────── */
function init() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    // No WebGL — skip straight to the card.
    fallbackToCard();
    return;
  }
  // Detect software WebGL (SwiftShader/llvmpipe) — bloom and env maps
  // are unusably slow there, so render the plain pipeline instead.
  const gl = renderer.getContext();
  const dbgInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : "";
  const softwareGL = /swiftshader|llvmpipe|software|basic render/i.test(String(gpu));
  usePost = !softwareGL;

  renderer.setPixelRatio(softwareGL ? 1 : Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0712);
  scene.fog = new THREE.FogExp2(0x0a0712, 0.014);

  // Soft studio environment so metals and marble pick up reflections.
  if (!softwareGL) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.22;
  }

  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.copy(START_POS);
  camera.lookAt(0, 4.5, -10);
  const e0 = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
  yaw = startYaw = e0.y;
  pitch = startPitch = e0.x;

  // Post-processing: subtle bloom for torches, windows, and steel glints.
  if (usePost) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.45, 0.6, 0.72
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  buildLighting();
  buildHall();
  buildThrone();

  bindEvents();
  animate();

  // Debug hook for headless testing (harmless in production).
  window.__hall = {
    renderer, scene, camera,
    render: () => (usePost && composer ? composer.render() : renderer.render(scene, camera)),
  };

  // Reveal once the first frames are drawn.
  setTimeout(() => loader.classList.add("hidden"), 500);
}

/* ─────────────────────────  LIGHTS  ──────────────────────── */
function buildLighting() {
  scene.add(new THREE.AmbientLight(0x353a52, 0.5));

  const hemi = new THREE.HemisphereLight(0x6f6c96, 0x191008, 0.55);
  scene.add(hemi);

  // "Moonlight" through the windows — the one shadow caster.
  const dir = new THREE.DirectionalLight(0xdfe6ff, 1.2);
  dir.position.set(12, 32, 10);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  const c = dir.shadow.camera;
  c.left = -26; c.right = 26; c.top = 32; c.bottom = -32; c.near = 1; c.far = 90;
  dir.shadow.bias = -0.0005;
  scene.add(dir);

  // Dramatic warm wash on the throne.
  const spot = new THREE.SpotLight(0xffdda0, 320, 70, 0.55, 0.6, 2);
  spot.position.set(0, 24, -2);
  spot.target.position.set(0, 5, -15);
  spot.castShadow = true;
  spot.shadow.bias = -0.0004;
  scene.add(spot);
  scene.add(spot.target);

  // Cool fill from the doors so the hall isn't a black pit.
  const fill = new THREE.PointLight(0x8898c8, 40, 60, 2);
  fill.position.set(0, 14, 24);
  scene.add(fill);
}

/* ─────────────────────────  HALL  ────────────────────────── */
const HALF_W = 14;      // walls at x = ±14
const Z_DOOR = 30;      // door end
const Z_BACK = -24;     // throne wall
const CEIL = 30;
const LEN = Z_DOOR - Z_BACK;

function buildHall() {
  const brick = pbr("castle_brick", 6, 5);
  const stone = new THREE.MeshStandardMaterial({ ...brick, color: 0x9a8f85, roughness: 1 });
  const stoneCeil = new THREE.MeshStandardMaterial({ ...pbr("castle_brick", 8, 8), color: 0x4a443f, roughness: 1 });

  // Floor — polished dark marble.
  const marble = pbr("marble_01", 5, 8);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_W * 2, LEN),
    new THREE.MeshStandardMaterial({
      ...marble, color: 0x5e5a58, roughness: 0.35, metalness: 0.1, envMapIntensity: 0.8
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (Z_DOOR + Z_BACK) / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Ceiling.
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, LEN), stoneCeil);
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

  // Tall narrow windows on both side walls (glowing, caught by bloom).
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x0b1024, emissive: 0xaec3ff, emissiveIntensity: 2.0, roughness: 1
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
      // stone mullion crossing the window
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.18, 15, 0.3), stone);
      mull.position.set(side * (HALF_W - 0.2), 15, z);
      scene.add(mull);
    }
  }

  // Columns down both sides, with torches facing the carpet.
  for (const z of [22, 12, 2, -8]) {
    for (const side of [-1, 1]) {
      buildColumn(side * 11, z);
      buildTorch(side * (10.1), z, side);
    }
  }

  // Banners flanking the throne (deep crimson, double-sided).
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x671713, roughness: 0.85, side: THREE.DoubleSide });
  for (const x of [-5.5, 5.5]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(4, 16, 8, 24), bannerMat);
    // gentle cloth ripple
    const pos = banner.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(y * 0.9 + pos.getX(i)) * 0.12);
    }
    banner.geometry.computeVertexNormals();
    banner.position.set(x, 16, Z_BACK + 0.35);
    scene.add(banner);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xb99a4a, metalness: 0.85, roughness: 0.3 }));
    trim.position.set(x, 24, Z_BACK + 0.4);
    scene.add(trim);
  }

  // Red carpet runner from doors to the dais.
  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 36),
    new THREE.MeshStandardMaterial({ color: 0x6e1b17, roughness: 0.95 })
  );
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.02, 10);
  carpet.receiveShadow = true;
  scene.add(carpet);
  // gold carpet borders
  for (const bx of [-3.1, 3.1]) {
    const edge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 36),
      new THREE.MeshStandardMaterial({ color: 0x9c7c33, roughness: 0.6, metalness: 0.4 })
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(bx, 0.021, 10);
    scene.add(edge);
  }

  // Great oak-and-bronze doors at the entrance.
  const wood = pbr("dark_wooden_planks", 2, 4);
  const woodMat = new THREE.MeshStandardMaterial({ ...wood, color: 0x8a6a48, roughness: 0.8 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x8a6428, metalness: 0.9, roughness: 0.35 });
  for (const dx of [-2.1, 2.1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(4, 16, 0.6), woodMat);
    door.position.set(dx, 8, Z_DOOR - 0.4);
    scene.add(door);
    // bronze bands
    for (const by of [3, 8, 13]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.35, 0.65), bronzeMat);
      band.position.set(dx, by, Z_DOOR - 0.4);
      scene.add(band);
    }
  }
  const doorRing = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 10, 24), bronzeMat);
  doorRing.position.set(-1.2, 8, Z_DOOR - 0.75);
  scene.add(doorRing);

  buildDais();
}

function buildColumn(x, z) {
  const mat = new THREE.MeshStandardMaterial({
    ...pbr("castle_brick", 2, 6), color: 0x8d8279, roughness: 1
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 26, 24), mat);
  shaft.position.set(x, 13, z);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  scene.add(shaft);
  const base = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 3), mat);
  base.position.set(x, 0.7, z);
  base.castShadow = true;
  scene.add(base);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 3), mat);
  cap.position.set(x, 26, z);
  scene.add(cap);
}

function buildTorch(x, z, side) {
  const bracket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.14, 1.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x1d1d1f, metalness: 0.8, roughness: 0.45 })
  );
  bracket.position.set(x, 9, z);
  bracket.rotation.z = side * 0.5;
  scene.add(bracket);

  // Flame: bright emissive core (bloom does the rest) + ember cone.
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xff9a33, emissiveIntensity: 3.2, roughness: 1
    })
  );
  flame.position.set(x - side * 0.42, 9.75, z);
  flame.scale.set(0.8, 1.3, 0.8);
  scene.add(flame);
  flames.push(flame);

  const light = new THREE.PointLight(0xff7a2c, 30, 26, 2);
  light.position.set(x - side * 0.4, 9.9, z);
  light.userData.base = 30;
  scene.add(light);
  torchLights.push(light);
}

function buildDais() {
  const stepMat = new THREE.MeshStandardMaterial({
    ...pbr("castle_brick", 4, 1), color: 0x37332f, roughness: 0.9
  });
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
/* The show throne is an asymmetric mound of hundreds of blades
   fanning up and outward behind the seat. We model one real sword
   (blade / crossguard / grip / pommel) and instance it ~260 times. */
function buildThrone() {
  throneGroup = new THREE.Group();
  throneGroup.position.set(0, 3, -15); // atop the platform

  const steel = new THREE.MeshStandardMaterial({
    color: 0x9da3aa, metalness: 1.0, roughness: 0.38, envMapIntensity: 1.1
  });
  const darkSteel = new THREE.MeshStandardMaterial({
    color: 0x4e5157, metalness: 0.95, roughness: 0.5, envMapIntensity: 0.9
  });

  // ── Core mound: melted-together slag the swords rise from ──
  const seatProfile = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    seatProfile.push(new THREE.Vector2(2.4 - t * 0.9 + Math.sin(t * 9) * 0.12, t * 2.6));
  }
  const mound = new THREE.Mesh(new THREE.LatheGeometry(seatProfile, 24), darkSteel);
  mound.scale.set(1, 1, 0.85);
  mound.castShadow = true;
  throneGroup.add(mound);

  // Seat slab and armrests.
  const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 2.4), darkSteel);
  seat.position.set(0, 2.6, 0.1);
  seat.castShadow = true;
  throneGroup.add(seat);
  for (const sx of [-1.55, 1.55]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 2.2), darkSteel);
    arm.position.set(sx, 3.3, 0.2);
    arm.rotation.x = -0.06;
    arm.castShadow = true;
    throneGroup.add(arm);
  }
  // Tall back core the sword-fan grows out of.
  const backCore = new THREE.Mesh(new THREE.BoxGeometry(2.9, 4.6, 0.7), darkSteel);
  backCore.position.set(0, 4.8, -0.9);
  backCore.rotation.x = 0.1;
  backCore.castShadow = true;
  throneGroup.add(backCore);

  // ── One real sword, instanced ──
  // Blade: tapered diamond cross-section. Origin at the guard, +Y = tip.
  const bladeGeo = new THREE.CylinderGeometry(0.015, 0.11, 1, 4, 1);
  bladeGeo.scale(1, 1, 0.4);            // flatten to a blade
  bladeGeo.translate(0, 0.5, 0);        // base at origin
  const guardGeo = new THREE.BoxGeometry(0.4, 0.055, 0.09);
  const gripGeo = new THREE.CylinderGeometry(0.033, 0.038, 0.24, 8);
  gripGeo.translate(0, -0.13, 0);
  const pommelGeo = new THREE.SphereGeometry(0.055, 8, 8);
  pommelGeo.translate(0, -0.27, 0);

  const transforms = buildSwordTransforms();
  const n = transforms.length;
  const parts = [
    new THREE.InstancedMesh(bladeGeo, steel, n),
    new THREE.InstancedMesh(guardGeo, darkSteel, n),
    new THREE.InstancedMesh(gripGeo, darkSteel, n),
    new THREE.InstancedMesh(pommelGeo, steel, n),
  ];
  transforms.forEach((m, i) => parts.forEach((p) => p.setMatrixAt(i, m)));
  for (const p of parts) {
    p.castShadow = true;
    p.instanceMatrix.needsUpdate = true;
    throneGroup.add(p);
  }

  // Invisible, generous click target so the throne is easy to select.
  clickTarget = new THREE.Mesh(
    new THREE.BoxGeometry(7.5, 12, 6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  clickTarget.position.set(0, 4.5, -0.5);
  throneGroup.add(clickTarget);

  scene.add(throneGroup);
}

/* Positions/orientations for ~260 swords: a tall central fan behind
   the seat, two swept wings, and a skirt bristling around the base. */
function buildSwordTransforms() {
  const rng = mulberry32(41);
  const out = [];
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const push = (x, y, z, tiltX, tiltZ, len, spinY = 0) => {
    pos.set(x, y, z);
    euler.set(tiltX, spinY, tiltZ, "YXZ");
    quat.setFromEuler(euler);
    const s = len;
    scale.set(0.9 + rng() * 0.3, s, 0.9 + rng() * 0.3);
    out.push(new THREE.Matrix4().compose(pos.clone(), quat.clone(), scale.clone()));
  };

  // 1) Central fan behind the backrest — 5 rows, tallest in the middle.
  for (let row = 0; row < 5; row++) {
    const count = 16 - row * 2;
    const baseY = 4.2 + row * 0.85;
    const z = -1.05 - row * 0.28;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;   // -0.5..0.5
      const x = t * (3.2 - row * 0.35);
      const centered = 1 - Math.abs(t) * 1.4;              // taller mid
      const len = 2.2 + centered * 1.8 + rng() * 0.7 + row * 0.25;
      push(
        x + (rng() - 0.5) * 0.22, baseY + (rng() - 0.5) * 0.3, z + (rng() - 0.5) * 0.15,
        -0.12 - row * 0.05 - rng() * 0.12,                 // lean back
        t * 0.55 + (rng() - 0.5) * 0.22,                   // fan outward
        len, (rng() - 0.5) * 0.9
      );
    }
  }

  // 1b) Dense curtain of blades covering the back slab's face.
  for (let row = 0; row < 7; row++) {
    for (let i = 0; i < 11; i++) {
      const x = -1.45 + (i / 10) * 2.9;
      push(
        x + (rng() - 0.5) * 0.15,
        2.7 + row * 0.75 + (rng() - 0.5) * 0.25,
        -0.5 + (rng() - 0.5) * 0.12,
        -0.06 - rng() * 0.1,
        (x / 1.5) * 0.18 + (rng() - 0.5) * 0.15,
        1.3 + rng() * 1.1,
        (rng() - 0.5) * 1.1
      );
    }
  }

  // 2) Side wings sweeping up past the armrests.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      push(
        side * (1.7 + t * 0.9 + rng() * 0.2),
        2.6 + t * 3.4 + rng() * 0.4,
        -0.4 - t * 0.7 + rng() * 0.3,
        -0.15 - rng() * 0.2,
        side * (0.35 + t * 0.55) + (rng() - 0.5) * 0.2,
        1.4 + t * 1.6 + rng() * 0.6,
        (rng() - 0.5) * 1.2
      );
    }
  }

  // 3) Skirt of blades bristling around the mound's base.
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + rng() * 0.1;
    const r = 2.1 + rng() * 0.5;
    push(
      Math.cos(a) * r,
      0.15 + rng() * 0.6,
      Math.sin(a) * r * 0.8,
      Math.sin(a) * 0.7 + (rng() - 0.5) * 0.3,             // splay outward
      -Math.cos(a) * 0.7 + (rng() - 0.5) * 0.3,
      0.9 + rng() * 1.1,
      rng() * Math.PI
    );
  }

  // 4) A few chaotic strays jutting from the seat area.
  for (let i = 0; i < 14; i++) {
    push(
      (rng() - 0.5) * 2.6,
      2.4 + rng() * 1.6,
      -0.6 + rng() * 0.8,
      (rng() - 0.5) * 0.9,
      (rng() - 0.5) * 0.9,
      0.8 + rng() * 1.4,
      rng() * Math.PI
    );
  }

  return out;
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
      yaw += dx * 0.0026;
      pitch += dy * 0.0026;
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
let usePost = true;
let lastT = performance.now();
let slowFrames = 0;

function animate() {
  requestAnimationFrame(animate);
  frame++;

  // Adaptive quality: if the GPU can't keep up (software WebGL,
  // weak hardware), drop bloom and pixel ratio instead of freezing.
  const now = performance.now();
  const dt = now - lastT;
  lastT = now;
  if (usePost && frame > 3 && frame < 60 && dt > 90) {
    if (++slowFrames >= 5) {
      usePost = false;
      renderer.setPixelRatio(1);
      renderer.setSize(window.innerWidth, window.innerHeight);
      console.info("Great Hall: low-quality mode (bloom off)");
    }
  }

  if (frame % 4 === 0) {
    for (const l of torchLights) l.intensity = l.userData.base * (0.72 + Math.random() * 0.5);
    const s = 0.85 + Math.random() * 0.35;
    for (const f of flames) f.scale.set(0.8, 1.3 * s, 0.8);
  }

  if (usePost) composer.render();
  else renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
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
