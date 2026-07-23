// 3rd-person chase camera: positions behind-and-above the avatar based on its
// current movement/facing direction, with smoothed position + lookAt lerping.
// No browser-only API is touched at module top level — only inside
// createChaseCamera(), so a bare `import` of this file never throws in Node.
export function createChaseCamera(camera, avatar, THREE) {
  const desiredPos = new THREE.Vector3();
  const lookTarget = new THREE.Vector3(avatar.position.x, avatar.position.y, avatar.position.z);
  const raycaster = new THREE.Raycaster();
  let obstacles = [];

  // Camera framing scales with the avatar: the offset must stay well outside
  // the avatar's own radius (26 + sqrt(mass)*1.9 — ~35 units at spawn,
  // ~1900 at level-100 mass) or the camera ends up inside the sphere and the
  // city is invisible. back ≈ 1.9r + height ≈ 1.05r puts the camera ~2.2r
  // away at a ~29° downward angle, framing the avatar bottom-center with the
  // city ahead in view.
  const BACK_DIST_BASE = 8;
  const HEIGHT_BASE = 4;

  function update(dt) {
    const r = typeof avatar.radius === 'function' ? avatar.radius() : 30;
    const yaw = avatar.object3D.rotation.y;
    const backDist = BACK_DIST_BASE + r * 1.9;
    const height = HEIGHT_BASE + r * 1.05;

    // Avatar faces along (sin(yaw), 0, cos(yaw)) — see avatar.js facingAngle
    // (Math.atan2(nx, nz)). "Behind" is the negative of that direction.
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);

    desiredPos.set(
      avatar.position.x - dirX * backDist,
      avatar.position.y + height,
      avatar.position.z - dirZ * backDist
    );

    // Best-effort obstacle pull-in: raycast from the avatar toward the desired
    // camera position; if a stored obstacle mesh blocks the path, pull the
    // camera in front of the hit point instead of clipping through it.
    // setObstacles() is otherwise a stored-but-unused hook, per spec.
    if (obstacles.length) {
      const origin = new THREE.Vector3(avatar.position.x, avatar.position.y + height * 0.5, avatar.position.z);
      const toCam = desiredPos.clone().sub(origin);
      const dist = toCam.length();
      if (dist > 0.0001) {
        const dir = toCam.clone().normalize();
        raycaster.set(origin, dir);
        raycaster.far = dist;
        // recursive=true: obstacles supplied by callers (src/content/propkit.js
        // buildings, src/content/landmarks.js) are THREE.Group instances with
        // no geometry of their own — only their child Meshes are raycastable —
        // so non-recursive intersection would silently never hit anything.
        const hits = raycaster.intersectObjects(obstacles, true);
        if (hits.length) {
          const pull = Math.max(0.5, hits[0].distance - 0.5);
          desiredPos.copy(origin).addScaledVector(dir, pull);
        }
      }
    }

    // Damped position/lookAt lerp — same feel as the old 2D game's camera
    // follow (`Math.min(1, dt*6)`), translated to 3D position + lookAt.
    const damp = Math.min(1, dt * 6);
    camera.position.lerp(desiredPos, damp);

    lookTarget.lerp(
      new THREE.Vector3(avatar.position.x, avatar.position.y + r * 0.15, avatar.position.z),
      damp
    );
    camera.lookAt(lookTarget);
  }

  function setObstacles(meshList) {
    obstacles = Array.isArray(meshList) ? meshList : [];
  }

  return { update, setObstacles };
}
