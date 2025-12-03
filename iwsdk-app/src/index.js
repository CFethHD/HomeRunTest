import {
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  PlaneGeometry,
  BoxGeometry,
  CanvasTexture,
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
   ADJUST THESE VALUES ONLY TO MOVE THE FIELD
   (reload after each change and see where it ends up)
----------------------------------------------------------- */
const FIELD_POS_X = -37.5; // left (-) / right (+)
const FIELD_POS_Y = 21;    // down (-) / up (+)
const FIELD_POS_Z = 60;    // towards you (-) / away from you (+)
const FIELD_SCALE  = 1;    // 1 = original size, 2 = double, 0.5 = half

// If you need to tilt it later, change these:
const FIELD_ROT_X = 0;     // radians
const FIELD_ROT_Y = 0;
const FIELD_ROT_Z = 0;
/* --------------------------------------------------------- */

const assets = {
  rugbyField: {
    url: '/rugby_field.glb', // file in public/
    type: AssetType.GLTF,
    priority: 'critical',
  },
};

// --- COMPONENT + SYSTEM FOR HOME RUN ----------------------------------

const HomeRunBall = createComponent('HomeRunBall', {});

class HomeRunSystem extends createSystem(
  { balls: { required: [HomeRunBall] } },
  {
    wallZ: { type: Types.Float32, default: -3.5 }, // logical "line", no mesh
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

// --- MESSAGE BOARD HELPER ---------------------------------------------

function createMessageBoard(world) {
  let board = null;

  function init() {
    if (board) return board;

    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const texture = new CanvasTexture(canvas);

    const aspect = canvas.width / canvas.height;
    const h = 1;
    const w = h * aspect;

    const mat = new MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const geo = new PlaneGeometry(w, h);
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
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111100';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
    entity.object3D.visible = true;
  }

  return { show };
}

// WORLD SETUP ----------------------------------------------------------

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
    features: { handTracking: true },
  },
  features: { grabbing: true, locomotion: true },
}).then((world) => {
  const wallZ = -3.5; // still used by HomeRunSystem, but no physical wall

  world
    .registerSystem(PhysicsSystem)
    .registerComponent(PhysicsBody)
    .registerComponent(PhysicsShape)
    .registerComponent(HomeRunBall);

  const board = createMessageBoard(world);

  // --- RUGBY FIELD (VISUAL ONLY) --------------------------------------
  try {
    const gltf = AssetManager.getGLTF('rugbyField');
    if (gltf) {
      const fieldModel = gltf.scene || gltf.scenes?.[0];
      const fieldEntity = world.createTransformEntity(fieldModel);

      fieldEntity.object3D.position.set(FIELD_POS_X, FIELD_POS_Y, FIELD_POS_Z);
      fieldEntity.object3D.rotation.set(FIELD_ROT_X, FIELD_ROT_Y, FIELD_ROT_Z);
      fieldEntity.object3D.scale.set(FIELD_SCALE, FIELD_SCALE, FIELD_SCALE);
    } else {
      console.warn('rugbyField GLTF not found in AssetManager');
    }
  } catch (err) {
    console.error('Failed to load rugbyField GLB:', err);
  }

  // --- INVISIBLE FLOOR FOR LOCOMOTION + PHYSICS -----------------------
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

  // --- BALL -----------------------------------------------------------
  const ballMesh = new Mesh(
    new SphereGeometry(0.15, 10, 10),
    new MeshStandardMaterial({ color: 'white' })
  );
  ballMesh.position.set(0.4, 1.6, -1.5);
  const ball = world
    .createTransformEntity(ballMesh)
    .addComponent(Interactable)
    .addComponent(OneHandGrabbable, { translate: true, rotate: true });
  ball.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
  ball.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });
  ball.addComponent(HomeRunBall);

  // --- BAT ------------------------------------------------------------
  const batMesh = new Mesh(
    new BoxGeometry(0.08, 0.9, 0.08),
    new MeshStandardMaterial({ color: 'brown' })
  );
  batMesh.position.set(-0.4, 1.5, -1.5);
  batMesh.rotation.z = Math.PI / 2;
  const bat = world
    .createTransformEntity(batMesh)
    .addComponent(Interactable)
    .addComponent(OneHandGrabbable, { translate: true, rotate: true });
  bat.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
  bat.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });

  // --- HOME-RUN SYSTEM (no physical wall) -----------------------------
  world.registerSystem(HomeRunSystem, {
    configData: {
      wallZ,
      show: (msg) => board.show(msg),
    },
  });

  // --- QUEST PANEL ----------------------------------------------------
  world.registerSystem(PanelSystem);
  if (isMetaQuest1()) {
    world
      .createTransformEntity()
      .addComponent(PanelUI, {
        config: '/ui/welcome.json',
        maxHeight: 0.8,
        maxWidth: 1.6,
      })
      .addComponent(Interactable)
      .addComponent(ScreenSpace, {
        top: '20px',
        left: '20px',
        height: '40%',
      });
  }

  function isMetaQuest1() {
    try {
      const ua = navigator.userAgent || '';
      const hasOculus = /Oculus|Quest|Meta Quest/i.test(ua);
      const isQuest2or3 =
        /Quest\s?2|Quest\s?3|Quest2|Quest3|MetaQuest2|Meta Quest 2/i.test(ua);
      return hasOculus && !isQuest2or3;
    } catch {
      return false;
    }
  }
});
