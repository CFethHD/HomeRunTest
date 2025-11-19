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
} from '@iwsdk/core';

import { PanelSystem } from './panel.js';

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
    .registerSystem(PhysicsSystem) // default gravity [0, -9.81, 0]
    .registerComponent(PhysicsBody)
    .registerComponent(PhysicsShape);

  // ---------------- MESSAGE BOARD ----------------
  let messageBoard = null;

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
    entity.object3D.position.set(0, 5, -5.5);
    entity.object3D.visible = false;

    messageBoard = { canvas, ctx, texture, entity };
    return messageBoard;
  }

  function showMessage(text) {
    const board = initMessageBoard();
    const { canvas, ctx, texture, entity } = board;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = 'bold 200px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    texture.needsUpdate = true;
    entity.object3D.visible = true;
  }

  // ---------------- BALL (GRABBABLE + PHYSICS) ----------------
  const sphereGeometry = new SphereGeometry(0.15, 32, 32);
  const ballMaterial = new MeshStandardMaterial({ color: 'white' });
  const ballMesh = new Mesh(sphereGeometry, ballMaterial);

  // Closer to you than the wall: wall is at z = -3.5, so start around -1.5
  ballMesh.position.set(0.4, 1.6, -1.5);

  const ballEntity = world
    .createTransformEntity(ballMesh)
    .addComponent(Interactable)
    .addComponent(OneHandGrabbable, {
      translate: true,
      rotate: true,
    });

  ballEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Auto, // auto-detect sphere
  });

  ballEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Dynamic, // falls, collides
  });

  // ---------------- BAT (GRABBABLE + PHYSICS) ----------------
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
    shape: PhysicsShapeType.Auto, // auto-detect box
  });

  batEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Dynamic,
  });

  // ---------------- FLOOR (STATIC PHYSICS) ----------------
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
    shape: PhysicsShapeType.Auto, // PlaneGeometry -> thin box floor
  });

  floorEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Static, // 🚫 will NOT fall now
  });

  // ---------------- WALL IN THE DISTANCE (STATIC PHYSICS) ----------------
  const wallZ = -3.5;

  const wallMesh = new Mesh(
    new PlaneGeometry(4, 2),
    new MeshStandardMaterial({ color: 'gray' })
  );
  wallMesh.position.set(0, 1.5, wallZ);

  // For a plane at negative Z with the camera looking toward negative Z,
  // rotation.y = 0 shows the front face to the player.
  wallMesh.rotation.y = 0;

  const wallEntity = world.createTransformEntity(wallMesh);

  wallEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Auto, // thin box wall
  });

  wallEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Static,
  });

  // ---------------- HOME RUN CHECK ----------------
  let homeRunShown = false;

  world.onUpdate(() => {
    if (homeRunShown) return;

    const ballPos = ballEntity.object3D.position;
    const ballZ = ballPos.z;

    // Slight fudge so we don't need the center to go way past the wall
    const homeRunLineZ = wallZ - 0.05; // e.g. -3.55

    // Ball moving toward NEGATIVE Z; home run when it goes PAST the wall
    if (ballZ < homeRunLineZ) {
      homeRunShown = true;

      console.log('Home run! ballZ =', ballZ, 'wallZ =', wallZ);
      showMessage('Home run!');
    }
  });

  // ---------------- QUEST 1 PANEL (UNCHANGED) ----------------
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
        /Quest\s?2|Quest\s?3|Quest2|Quest3|MetaQuest2|Meta Quest 2/i.test(ua);
      return hasOculus && !isQuest2or3;
    } catch (e) {
      return false;
    }
  }
});
