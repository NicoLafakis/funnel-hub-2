// 3rd-person chase camera: positions behind-and-above the avatar based on its
// current movement/facing direction, with smoothed position + lookAt lerping.
// No browser-only API is touched at module top level — only inside
// createChaseCamera(), so a bare `import` of this file never throws in Node.
export function createChaseCamera(camera, avatar, THREE) {
  const desiredPos = new THREE.Vector3();
  const lookTarget = new THREE.Vector3(avatar.position.x, avatar.position.y, avatar.position.z);
  const raycaster = new THREE.Raycaster();
  let obstacles = [];

  // Camera framing scales with the avatar: the offset must stay outside the
  // avatar's own radius (26 + sqrt(mass/divisor)*1.9) or the camera ends up
  // inside the sphere. back ~2.6r + height ~1.5r frames the avatar in the
  // lower third with plenty of city in view — earlier values (1.9r/1.05r)
  // still let the ball fill most of the screen, and with a featureless
  // ground players reported "a ball sliding around in nothing".
  // Camera framing scales smoothly with avatar growth: starting closer at initial
  // radius (r=26) and pulling back gradually as mass increases, preventing the
  // camera from zooming out too far too quickly on early prop swallows.
  const BASE_R = 26;

  function update(dt) {
    const r = typeof avatar.radius === 'function' ? avatar.radius() : 30;
    const yaw = avatar.object3D.rotation.y;
    const growth = Math.max(0, r - BASE_R);
    const backDist = 52 + growth * 1.4 + Math.sqrt(growth) * 3.5;
    const height = 28 + growth * 0.8 + Math.sqrt(growth) * 1.8;

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

    // Camera shake impulse for large prop / capstone swallows (addKick).
    if (shakeIntensity > 0.001) {
      const offset = (Math.random() * 2 - 1) * shakeIntensity * (r * 0.08);
      camera.position.x += offset;
      camera.position.y += offset * 0.5;
      shakeIntensity *= Math.exp(-dt * 12);
    } else {
      shakeIntensity = 0;
    }
  }

  function addKick(amount = 0.3) {
    if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
      shakeIntensity = Math.min(1.5, shakeIntensity + amount);
    }
  }

  function setObstacles(meshList) {
    obstacles = Array.isArray(meshList) ? meshList : [];
  }

  return { update, setObstacles, addKick };
}
