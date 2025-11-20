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
} from '@iwsdk/core';

import { PanelSystem } from './panel.js';

const assets = {};

// --- COMPONENT + SYSTEM FOR HOME RUN ----------------------------------

const HomeRunBall = createComponent('HomeRunBall', {});

class HomeRunSystem extends createSystem(
  { balls: { required: [HomeRunBall] } },
  {
    wallZ: { type: Types.Float32, default: -3.5 },
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
        show('Home run!');
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
    entity.object3D.position.set(0, 1.5, -3.2); 
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

// WORLD SETUP 

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
    features: { handTracking: true },
  },
  features: { grabbing: true, locomotion: true },
}).then((world) => {
  const wallZ = -3.5;

  world
    .registerSystem(PhysicsSystem)
    .registerComponent(PhysicsBody)
    .registerComponent(PhysicsShape)
    .registerComponent(HomeRunBall);

  const board = createMessageBoard(world);

  // Ball
  const ballMesh = new Mesh(
    new SphereGeometry(0.15, 32, 32),
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

  // Bat
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

  // Floor
  const floorMesh = new Mesh(
    new PlaneGeometry(20, 20),
    new MeshStandardMaterial({ color: 'tan' })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  const floor = world.createTransformEntity(floorMesh);
  floor.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  floor.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
  floor.addComponent(PhysicsBody, { state: PhysicsState.Static });

  // Wall
  const wallMesh = new Mesh(
    new PlaneGeometry(4, 2),
    new MeshStandardMaterial({ color: 'gray' })
  );
  wallMesh.position.set(0, 1.5, wallZ);
  const wall = world.createTransformEntity(wallMesh);
  wall.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
  wall.addComponent(PhysicsBody, { state: PhysicsState.Static });

  // Home-run system
  world.registerSystem(HomeRunSystem, {
    configData: {
      wallZ,
      show: (msg) => board.show(msg),
    },
  });

  // Quest panel (minimal)
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
