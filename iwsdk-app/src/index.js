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
} from '@iwsdk/core';

import { PanelSystem } from './panel.js';

/* -----------------------------------------------------------
   FIELD TRANSFORM
----------------------------------------------------------- */
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
    wallZ: { type: Types.Float32, default: -4 },
    show: { type: Types.Object, default: null },
  }
) {
  init() {
    this.triggered = false;
  }

  update() {
    if (this.triggered) return;

    const wallZ = this.config.wallZ.peek();
    const show = this.config.show.peek();
    if (!show) return;

    for (const e of this.queries.balls.entities) {
      const z = e.object3D?.position.z ?? 0;
      if (z < wallZ) {
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
    new SphereGeometry(0.15, 12, 12),
    new MeshStandardMaterial({ color: 'white' })
  );
  ballMesh.position.set(0.4, 1.6, -1.5);
  const ball = world.createTransformEntity(ballMesh);
  ball.addComponent(Interactable);
  ball.addComponent(OneHandGrabbable, { translate: true, rotate: true });
  ball.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
  ball.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });
  ball.addComponent(HomeRunBall);

  // --- BAT -----------------------------------------------------------
  const batMesh = new Mesh(
    new BoxGeometry(0.08, 0.9, 0.08),
    new MeshStandardMaterial({ color: 'brown' })
  );
  batMesh.position.set(-0.4, 1.5, -1.5);
  batMesh.rotation.z = Math.PI / 2;
  const bat = world.createTransformEntity(batMesh);
  bat.addComponent(Interactable);
  bat.addComponent(OneHandGrabbable, { translate: true, rotate: true });
  bat.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
  bat.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });

  // --- GOALIE PHYSICS BLOCKER (INVISIBLE) ----------------------------
  const blockerMesh = new Mesh(
    new BoxGeometry(0.8, 1.9, 0.3),
    new MeshStandardMaterial({ transparent: true, opacity: 0 })
  );
  blockerMesh.position.set(0, 1, -3.75);
  const blocker = world.createTransformEntity(blockerMesh);
  blocker.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
  blocker.addComponent(PhysicsBody, { state: PhysicsState.Static });

  // --- GOALIE IMAGE --------------------------------------------------
  const goalieTexture = new TextureLoader().load('/gaa_goalie.png');

  const goalieMesh = new Mesh(
    new PlaneGeometry(1.2, 2.1),
    new MeshBasicMaterial({
      map: goalieTexture,
      transparent: true,
    })
  );
  goalieMesh.position.set(0, 1.05, -3.9);
  goalieMesh.lookAt(0, 1.05, 0); // face towards the player/origin
  world.createTransformEntity(goalieMesh);

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
