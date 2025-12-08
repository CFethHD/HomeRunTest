import {
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  SphereGeometry,
  PlaneGeometry,
  BoxGeometry,
  CanvasTexture,
  TextureLoader,
  SessionMode,
  World,
  LocomotionEnvironment,
  EnvironmentType,
  Interactable,
  PanelUI,
  ScreenSpace,
  OneHandGrabbable,
  PhysicsBody,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  PhysicsSystem,
  createComponent,
  createSystem,
  Types,
  AssetManager,
  AssetType,
  Group,
} from '@iwsdk/core';

import { PanelSystem } from './panel.js';

// --- PROCEDURAL NET TEXTURE -----------------------------------------
function createNetTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;

  const step = 64; // net square size

  for (let x = 0; x <= canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  return new CanvasTexture(canvas);
}

// the field
const FIELD_POS_X = -37.5;
const FIELD_POS_Y = 21;
const FIELD_POS_Z = 60;
const FIELD_SCALE = 1;

const FIELD_ROT_X = 0;
const FIELD_ROT_Y = 0;
const FIELD_ROT_Z = 0;
/* --------------------------------------------------------- */

const assets = {
  rugbyField: {
    url: '/rugby_field.glb',
    type: AssetType.GLTF,
    priority: 'critical',
  },
};

// --- COMPONENT + SYSTEM FOR SCORING ----------------------------------

const HomeRunBall = createComponent('HomeRunBall', {});

class HomeRunSystem extends createSystem(
  { balls: { required: [HomeRunBall] } },
  {
    wallZ:    { type: Types.Float32, default: -4 },  // z line to score past
    show:     { type: Types.Object,  default: null },

    // X range of the posts (goal mouth)
    goalXMin: { type: Types.Float32, default: -2 },  // left post
    goalXMax: { type: Types.Float32, default:  2 },  // right post
  }
) {
  init() {
    this.triggered = false;
  }

  update() {
    if (this.triggered) return;

    const wallZ    = this.config.wallZ.peek();
    const show     = this.config.show.peek();
    const goalXMin = this.config.goalXMin.peek();
    const goalXMax = this.config.goalXMax.peek();
    if (!show) return;

    for (const e of this.queries.balls.entities) {
      const pos = e.object3D?.position;
      if (!pos) continue;

      const x = pos.x;
      const z = pos.z;

      // ✅ Must cross the z line AND be between the posts (X range)
      if (z < wallZ && x >= goalXMin && x <= goalXMax) {
        this.triggered = true;
        show('3 Points for Dublin!');
        break;
      }
    }
  }
}

// --- MESSAGE BOARD ---------------------------------------------------

function createMessageBoard(world) {
  let board = null;

  function init() {
    if (board) return board;

    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const texture = new CanvasTexture(canvas);

    const geo = new PlaneGeometry(2, 1);
    const mat = new MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const mesh = new Mesh(geo, mat);
    const entity = world.createTransformEntity(mesh);
    entity.object3D.position.set(0, 3.5, -6);
    entity.object3D.visible = false;

    board = { canvas, ctx, texture, entity };
    return board;
  }

  function show(text) {
    const { canvas, ctx, texture, entity } = init();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 120px sans-serif';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
    entity.object3D.visible = true;
  }

  return { show };
}

// WORLD ---------------------------------------------------------------

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
    features: { handTracking: true },
  },
  features: { grabbing: true, locomotion: true },
}).then((world) => {
  const wallZ = -4;

  world
    .registerSystem(PhysicsSystem)
    .registerComponent(PhysicsBody)
    .registerComponent(PhysicsShape)
    .registerComponent(HomeRunBall);

  const board = createMessageBoard(world);

  // --- FIELD ---------------------------------------------------------
  try {
    const gltf = AssetManager.getGLTF('rugbyField');
    if (gltf) {
      const fieldScene = gltf.scene || gltf.scenes?.[0];
      const field = world.createTransformEntity(fieldScene);
      field.object3D.position.set(FIELD_POS_X, FIELD_POS_Y, FIELD_POS_Z);
      field.object3D.rotation.set(FIELD_ROT_X, FIELD_ROT_Y, FIELD_ROT_Z);
      field.object3D.scale.set(FIELD_SCALE, FIELD_SCALE, FIELD_SCALE);
    }
  } catch (e) {
    console.error('Failed to load rugbyField:', e);
  }

  // --- FLOOR (back to known-good version) ----------------------------
  const floorMesh = new Mesh(
    new PlaneGeometry(40, 40),
    new MeshStandardMaterial({
      color: 'white',
      transparent: true,
      opacity: 0, // invisible but collidable
    })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, 0, 0);

  const floor = world.createTransformEntity(floorMesh);
  floor.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  floor.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
  floor.addComponent(PhysicsBody, { state: PhysicsState.Static });

  // --- BALL ----------------------------------------------------------
  const ballMesh = new Mesh(
    new SphereGeometry(0.10, 12, 12),
    new MeshStandardMaterial({ color: 'white' })
  );
  ballMesh.position.set(0.4, 1.6, -1.5);
  const ball = world.createTransformEntity(ballMesh);
  ball.addComponent(Interactable);
  ball.addComponent(OneHandGrabbable, { translate: true, rotate: true });
  ball.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
  ball.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });
  ball.addComponent(HomeRunBall);

  // --- BAT (HURLEY) ------------------------------------------------------
const hurley = new Group();

// Grip (black tape at the top)
const gripGeo = new BoxGeometry(0.035, 0.25, 0.035);
const gripMat = new MeshStandardMaterial({ color: '#111111' });
const gripMesh = new Mesh(gripGeo, gripMat);
gripMesh.position.set(0, 0.75, 0);
hurley.add(gripMesh);

// Main handle (same thin stick you liked)
const handleGeo = new BoxGeometry(0.04, 0.55, 0.04);
const handleMat = new MeshStandardMaterial({ color: '#c5a376' });
const handleMesh = new Mesh(handleGeo, handleMat);
handleMesh.position.set(0, 0.4, 0);
hurley.add(handleMesh);

// Thicker body / neck near the bas
const neckGeo = new BoxGeometry(0.07, 0.22, 0.05);
const neckMesh = new Mesh(neckGeo, handleMat);
// This sits right at the bottom of the handle and widens out
neckMesh.position.set(0, 0.05, 0);
hurley.add(neckMesh);

// Bas (smaller + connected to the neck)
const basGeo = new SphereGeometry(0.09, 16, 16);
const basMesh = new Mesh(basGeo, handleMat);

// Flatten and widen it so it looks like the paddle
basMesh.scale.set(1.4, 0.45, 0.9);
// Move it so it overlaps the neck slightly (no gap)
basMesh.position.set(0, -0.09, 0.06);

hurley.add(basMesh);

// Position the whole hurley in front of the player
hurley.position.set(-0.4, 1.5, -1.5);
hurley.rotation.z = Math.PI / 2;

const bat = world.createTransformEntity(hurley);
bat.addComponent(Interactable);
bat.addComponent(OneHandGrabbable, { translate: true, rotate: true });
bat.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
bat.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });

  // --- GOALIE IMAGE --------------------------------------------------
  const goalieTexture = new TextureLoader().load('/gaa_goalie.png');

  const goalieMesh = new Mesh(
    new PlaneGeometry(1.2, 2.1),
    new MeshBasicMaterial({
      map: goalieTexture,
      transparent: true,
      side: 2,
    })
  );
  goalieMesh.position.set(0, 1.05, -5);
  goalieMesh.lookAt(0, 1.05, 0); // face towards the player/origin
  world.createTransformEntity(goalieMesh);

  // --- BACK NET IMAGE (BEHIND GOAL) ---------------------------------
const netTexture = createNetTexture();

const netMesh = new Mesh(
  new PlaneGeometry(8, 10), // size of back net
  new MeshStandardMaterial({
    map: netTexture,
    transparent: true,
    opacity: 0.8,
    side: 2, // DoubleSide
    depthWrite: false,
  })
);

netMesh.position.set(0, 2.5, -7);
netMesh.lookAt(0, 2.5, 0);

const backNet = world.createTransformEntity(netMesh);
backNet.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
backNet.addComponent(PhysicsBody, { state: PhysicsState.Static });

  // --- SCORING SYSTEM ------------------------------------------------
  world.registerSystem(HomeRunSystem, {
    configData: {
      wallZ,
      show: (msg) => board.show(msg),
    },
  });

  // --- UI ------------------------------------------------------------
  world.registerSystem(PanelSystem);
});
