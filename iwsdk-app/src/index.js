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

// --- COMPONENT + SYSTEM FOR HOME RUN ----------------------------------

// Tag component to mark the ball we care about
const HomeRunBall = createComponent('HomeRunBall', {});

// System that runs every frame and checks ball Z vs wall Z
class HomeRunSystem extends createSystem(
  {
    balls: { required: [HomeRunBall] },
  },
  {
    wallZ: { type: Types.Float32, default: -3.5 },
    showMessageFn: { type: Types.Object, default: null },
  }
) {
  init() {
    this.triggered = false;
  }

  update() {
    if (this.triggered) return;

    const wallZ = this.config.wallZ.peek();
    const showMessageFn = this.config.showMessageFn.peek();
    if (!showMessageFn) return;

    for (const entity of this.queries.balls.entities) {
      const obj = entity.object3D;
      if (!obj) continue;

      const ballZ = obj.position.z;

      // Ball moving towards negative Z; "past wall" once ballZ < wallZ
      if (ballZ < wallZ) {
        this.triggered = true;
        showMessageFn(); // will show "Home run!"
        break;
      }
    }
  }
}

// ----------------------------------------------------------------------

const assets = {};

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
    features: {
      handTracking: true,
    },
  },
  features: {
    grabbing: true,
    locomotion: true,
  },
}).then((world) => {
  const { camera } = world;

  // --- REGISTER PHYSICS SYSTEM & COMPONENTS ---
  world
    .registerSystem(PhysicsSystem)
    .registerComponent(PhysicsBody)
    .registerComponent(PhysicsShape)
    .registerComponent(HomeRunBall); // our tag component

  // -------------------------------------------------------------------
  // MESSAGE BOARD (same style as treasure-hunt project)
  // -------------------------------------------------------------------

  let messageBoard; // { canvas, ctx, texture, entity }

  function initMessageBoard() {
    if (messageBoard) return messageBoard;

    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;

    const ctx = canvas.getContext('2d');
    const texture = new CanvasTexture(canvas);

    const aspect = canvas.width / canvas.height;
    const boardHeight = 1;
    const boardWidth = boardHeight * aspect;

    const boardMaterial = new MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const boardGeometry = new PlaneGeometry(boardWidth, boardHeight);
    const boardMesh = new Mesh(boardGeometry, boardMaterial);

    const entity = world.createTransformEntity(boardMesh);

    // Place board between player (z ~ 0) and wall (z = -3.5)
    entity.object3D.position.set(0, 1.5, -2);
    entity.object3D.visible = false;

    messageBoard = { canvas, ctx, texture, entity };
    return messageBoard;
  }

  function showMessage(message) {
    const { canvas, ctx, texture, entity } = initMessageBoard();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 120px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111100';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);

    texture.needsUpdate = true;
    entity.object3D.visible = true;
  }

  function hideMessage() {
    if (!messageBoard) return;
    const { canvas, ctx, texture, entity } = messageBoard;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    texture.needsUpdate = true;
    entity.object3D.visible = false;
  }

  function showTemporaryMessage(message, duration = 2000) {
    showMessage(message);
    setTimeout(hideMessage, duration);
  }

  // Convenience: specific function for the home-run text
  function showHomeRunMessage() {
    showTemporaryMessage('Home run!', 4000);
  }

  // -------------------------------------------------------------------
  // BALL (GRABBABLE + PHYSICS)
  // -------------------------------------------------------------------

  const sphereGeometry = new SphereGeometry(0.15, 32, 32);
  const ballMaterial = new MeshStandardMaterial({ color: 'white' });
  const ballMesh = new Mesh(sphereGeometry, ballMaterial);

  // Start in front of player, closer than the wall
  ballMesh.position.set(0.4, 1.6, -1.5);

  const ballEntity = world
    .createTransformEntity(ballMesh)
    .addComponent(Interactable)
    .addComponent(OneHandGrabbable, {
      translate: true,
      rotate: true,
    });

  ballEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Auto,
  });

  ballEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Dynamic,
  });

  // Tag this as the ball our HomeRunSystem should watch
  ballEntity.addComponent(HomeRunBall);

  // -------------------------------------------------------------------
  // BAT (GRABBABLE + PHYSICS)
  // -------------------------------------------------------------------

  const batGeometry = new BoxGeometry(0.08, 0.9, 0.08);
  const batMaterial = new MeshStandardMaterial({ color: 'brown' });
  const batMesh = new Mesh(batGeometry, batMaterial);
  batMesh.position.set(-0.4, 1.5, -1.5);

  const batEntity = world
    .createTransformEntity(batMesh)
    .addComponent(Interactable)
    .addComponent(OneHandGrabbable, {
      translate: true,
      rotate: true,
    });

  batEntity.object3D.rotation.z = Math.PI / 2;

  batEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Auto,
  });

  batEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Dynamic,
  });

  // -------------------------------------------------------------------
  // FLOOR (STATIC PHYSICS)
  // -------------------------------------------------------------------

  const floorMesh = new Mesh(
    new PlaneGeometry(20, 20),
    new MeshStandardMaterial({ color: 'tan' })
  );
  floorMesh.rotation.x = -Math.PI / 2;

  const floorEntity = world.createTransformEntity(floorMesh);
  floorEntity.addComponent(LocomotionEnvironment, {
    type: EnvironmentType.STATIC,
  });

  floorEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Auto,
  });

  floorEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Static,
  });

  // -------------------------------------------------------------------
  // WALL (STATIC PHYSICS)
  // -------------------------------------------------------------------

  const wallZ = -3.5;

  const wallMesh = new Mesh(
    new PlaneGeometry(4, 2),
    new MeshStandardMaterial({ color: 'gray' })
  );
  wallMesh.position.set(0, 1.5, wallZ);
  wallMesh.rotation.y = 0;

  const wallEntity = world.createTransformEntity(wallMesh);

  wallEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Auto,
  });

  wallEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Static,
  });

  // -------------------------------------------------------------------
  // REGISTER HOME RUN SYSTEM (this is what actually checks each frame)
  // -------------------------------------------------------------------

  world.registerSystem(HomeRunSystem, {
    configData: {
      wallZ,
      showMessageFn: showHomeRunMessage,
    },
  });

  // -------------------------------------------------------------------
  // QUEST 1 PANEL (unchanged)
  // -------------------------------------------------------------------

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
  } else {
    console.log('Panel UI skipped: not running on Meta Quest 1 (heuristic).');
  }

  function isMetaQuest1() {
    try {
      const ua = (navigator && (navigator.userAgent || '')) || '';
      const hasOculus = /Oculus|Quest|Meta Quest/i.test(ua);
      const isQuest2or3 =
        /Quest\\s?2|Quest\\s?3|Quest2|Quest3|MetaQuest2|Meta Quest 2/i.test(ua);
      return hasOculus && !isQuest2or3;
    } catch (e) {
      return false;
    }
  }
});
