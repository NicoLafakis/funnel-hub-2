// Render-only authored-city surroundings. Receives THREE from main so content
// keeps the repository's import boundary. Every descriptor is deterministic
// pure data from districts.js; these meshes never enter collision, spatial
// hashes, progression mass, or saves.

function material(THREE, color, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

export function createCityContext(THREE, descriptor, opts = {}) {
  const group = new THREE.Group();
  group.name = `city-context-${descriptor && descriptor.id ? descriptor.id : 'none'}`;
  if (!descriptor || descriptor.id !== 'chicago-loop') return group;
  group.userData.assetIds = Object.freeze([...(descriptor.assetIds || [])]);

  const groundMat = material(THREE, 0x69735f, 0.96);
  if (descriptor.ground) {
    const rec = descriptor.ground;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rec.w, rec.d), groundMat);
    mesh.name = 'chicago-context-ground';
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(rec.x, -0.82, rec.z);
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  // Photoreal water tiles (textures.js, canvases via main.js). One clone per
  // plane so each sets its own world-scale repeat; flat color fallback keeps
  // the old look when the tiles are missing.
  const waterCanvases = { river: opts.waterRiver || null, lake: opts.waterLake || null };
  const WATER_TILE_WORLD = 96;
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x397e9f, roughness: 0.34, metalness: 0.05,
  });
  for (const [i, rec] of (descriptor.water || []).entries()) {
    const geo = new THREE.PlaneGeometry(rec.w, rec.d);
    const src = waterCanvases[rec.lake ? 'lake' : 'river'];
    let mat = waterMat;
    if (src && typeof document !== 'undefined') {
      const tex = new THREE.CanvasTexture(src);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(rec.w / WATER_TILE_WORLD, rec.d / WATER_TILE_WORLD);
      tex.anisotropy = 4;
      mat = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.34, metalness: 0.05, map: tex,
      });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = rec.lake ? 'lake-michigan-context' : `chicago-river-${i}`;
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rec.rotY || 0;
    mesh.position.set(rec.x, -0.35, rec.z);
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  const roadMat = material(THREE, 0x55585c, 0.94);
  const roads = descriptor.roads || [];
  const roadGeo = new THREE.BoxGeometry(1, 1, 1);
  const roadMesh = new THREE.InstancedMesh(roadGeo, roadMat, roads.length);
  roadMesh.name = 'chicago-context-road-grid';
  const roadMatrix = new THREE.Matrix4();
  roads.forEach((road, i) => {
    roadMatrix.compose(
      new THREE.Vector3(road.x, -0.55, road.z),
      new THREE.Quaternion(),
      new THREE.Vector3(road.w, 0.22, road.d),
    );
    roadMesh.setMatrixAt(i, roadMatrix);
  });
  roadMesh.instanceMatrix.needsUpdate = true;
  roadMesh.castShadow = false;
  roadMesh.receiveShadow = false;
  group.add(roadMesh);

  // Two distance palettes mimic shallow depth-of-field without a full-screen
  // post-process: far silhouettes are lighter, quieter, and merge into fog.
  const palettes = [
    [0x746d67, 0x8a745f, 0x66747a, 0x686275],
    [0x8a8980, 0x948879, 0x7e898b, 0x807b89],
  ];
  const buildings = descriptor.buildings || [];
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildingMeshes = palettes.flatMap((palette, distanceBand) => palette.map((color, tone) => {
    const records = buildings.filter((b) => b.tone === tone && b.distanceBand === distanceBand);
    const mesh = new THREE.InstancedMesh(buildingGeo, material(THREE, color), records.length);
    mesh.name = `chicago-context-buildings-${distanceBand}-${tone}`;
    const matrix = new THREE.Matrix4();
    records.forEach((b, i) => {
      matrix.compose(
        new THREE.Vector3(b.x, b.h / 2 - 0.5, b.z),
        new THREE.Quaternion(),
        new THREE.Vector3(b.w, b.h, b.d),
      );
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  }));

  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = material(THREE, 0x4f5152, 0.92);
  const roofMesh = new THREE.InstancedMesh(roofGeo, roofMat, buildings.length);
  roofMesh.name = 'chicago-context-rooftops';
  const roofMatrix = new THREE.Matrix4();
  buildings.forEach((b, i) => {
    roofMatrix.compose(
      new THREE.Vector3(b.x, b.h - 0.5, b.z),
      new THREE.Quaternion(),
      new THREE.Vector3(b.w * 0.38, Math.max(3, b.h * 0.045), b.d * 0.38),
    );
    roofMesh.setMatrixAt(i, roofMatrix);
  });
  roofMesh.instanceMatrix.needsUpdate = true;
  roofMesh.castShadow = false;
  roofMesh.receiveShadow = false;
  group.add(roofMesh);

  const trees = descriptor.trees || [];
  const treeGeo = new THREE.IcosahedronGeometry(1, 0);
  const treeMat = material(THREE, 0x4f7546, 0.95);
  const treeMesh = new THREE.InstancedMesh(treeGeo, treeMat, trees.length);
  treeMesh.name = 'chicago-context-tree-canopy';
  const treeMatrix = new THREE.Matrix4();
  trees.forEach((tree, i) => {
    treeMatrix.compose(
      new THREE.Vector3(tree.x, tree.s * 0.7 - 0.5, tree.z),
      new THREE.Quaternion(),
      new THREE.Vector3(tree.s, tree.s * 1.35, tree.s),
    );
    treeMesh.setMatrixAt(i, treeMatrix);
  });
  treeMesh.instanceMatrix.needsUpdate = true;
  treeMesh.castShadow = false;
  treeMesh.receiveShadow = false;
  group.add(treeMesh);

  const railMat = material(THREE, 0x343b42, 0.68);
  const tieMat = material(THREE, 0x54504a, 0.9);
  const rail = descriptor.rail || [];
  const beamGeo = new THREE.BoxGeometry(1, 1, 1);
  const tieGeo = new THREE.BoxGeometry(1, 1, 1);
  const beamMesh = new THREE.InstancedMesh(beamGeo, railMat, rail.length * 2);
  beamMesh.name = 'loop-elevated-beams';
  const tieCount = rail.reduce((sum, rec) => sum + Math.max(4, Math.floor(rec.w / 32)), 0);
  const tieMesh = new THREE.InstancedMesh(tieGeo, tieMat, tieCount);
  tieMesh.name = 'loop-elevated-ties';
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let beamIndex = 0;
  let tieIndex = 0;
  for (const rec of rail) {
    const yaw = rec.rotY || 0;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    for (const offset of [-7, 7]) {
      pos.set(rec.x + offset * s, 30, rec.z + offset * c);
      scale.set(rec.w, 2.4, 2.8);
      matrix.compose(pos, quat, scale);
      beamMesh.setMatrixAt(beamIndex++, matrix);
    }
    const ties = Math.max(4, Math.floor(rec.w / 32));
    for (let j = 0; j < ties; j += 1) {
      const localX = ((j + 0.5) / ties - 0.5) * rec.w;
      pos.set(rec.x + localX * c, 30.4, rec.z - localX * s);
      scale.set(3, 1.4, 20);
      matrix.compose(pos, quat, scale);
      tieMesh.setMatrixAt(tieIndex++, matrix);
    }
  }
  beamMesh.instanceMatrix.needsUpdate = true;
  tieMesh.instanceMatrix.needsUpdate = true;
  beamMesh.castShadow = false;
  tieMesh.castShadow = false;
  group.add(beamMesh, tieMesh);

  // The Loop is a steel viaduct, not rails hovering over asphalt. Repeated
  // portal frames, station decks, canopies, and a short L train create the
  // unmistakable high-angle Chicago silhouette while staying render-only.
  const supportRecords = [];
  for (const rec of rail) {
    const count = Math.max(3, Math.floor(rec.w / 70));
    const yaw = rec.rotY || 0;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (let j = 0; j < count; j += 1) {
      const localX = ((j + 0.5) / count - 0.5) * rec.w;
      for (const offset of [-9, 9]) {
        supportRecords.push({
          x: rec.x + localX * c + offset * s,
          z: rec.z - localX * s + offset * c,
          yaw,
        });
      }
    }
  }
  const supportGeo = new THREE.BoxGeometry(1, 1, 1);
  const supportMesh = new THREE.InstancedMesh(supportGeo, railMat, supportRecords.length);
  supportMesh.name = 'loop-elevated-support-columns';
  supportRecords.forEach((rec, i) => {
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rec.yaw);
    matrix.compose(
      new THREE.Vector3(rec.x, 14.5, rec.z),
      quat,
      new THREE.Vector3(3.2, 29, 3.2),
    );
    supportMesh.setMatrixAt(i, matrix);
  });
  supportMesh.instanceMatrix.needsUpdate = true;
  supportMesh.castShadow = false;
  supportMesh.receiveShadow = false;
  group.add(supportMesh);

  const stationMat = material(THREE, 0x59636a, 0.78);
  const canopyMat = material(THREE, 0x71848b, 0.64);
  const stationGroup = new THREE.Group();
  stationGroup.name = 'loop-stations-and-train';
  const stationSegments = [rail[0], rail[1]].filter(Boolean);
  stationSegments.forEach((rec, i) => {
    const yaw = rec.rotY || 0;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const along = i === 0 ? -rec.w * 0.23 : rec.w * 0.19;
    const sx = rec.x + along * c;
    const sz = rec.z - along * s;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(92, 3.2, 30), stationMat);
    deck.position.set(sx, 31, sz);
    deck.rotation.y = yaw;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(72, 3, 25), canopyMat);
    canopy.position.set(sx, 43, sz);
    canopy.rotation.y = yaw;
    const canopyPosts = [-28, 28].flatMap((alongPost) => [-10, 10].map((across) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(2.4, 11, 2.4), railMat);
      post.position.set(
        sx + alongPost * c + across * s,
        36.5,
        sz - alongPost * s + across * c,
      );
      return post;
    }));
    stationGroup.add(deck, canopy, ...canopyPosts);
  });

  if (rail[0]) {
    const rec = rail[0];
    const trainMat = material(THREE, 0xb8bcc0, 0.46);
    const stripeMat = material(THREE, 0x2f6f9b, 0.5);
    for (let car = 0; car < 3; car += 1) {
      const along = rec.w * 0.18 + (car - 1) * 46;
      const body = new THREE.Mesh(new THREE.BoxGeometry(42, 14, 18), trainMat);
      body.position.set(rec.x + along, 40, rec.z);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(42.4, 3, 18.4), stripeMat);
      stripe.position.set(rec.x + along, 40, rec.z);
      stationGroup.add(body, stripe);
    }
  }
  stationGroup.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = false;
    node.receiveShadow = false;
  });
  group.add(stationGroup);

  group.userData.dispose = () => {
    const geometries = new Set();
    const materials = new Set();
    group.traverse((node) => {
      if (!node.isMesh) return;
      if (node.geometry) geometries.add(node.geometry);
      if (Array.isArray(node.material)) node.material.forEach((m) => materials.add(m));
      else if (node.material) materials.add(node.material);
    });
    geometries.forEach((geo) => geo.dispose());
    materials.forEach((mat) => mat.dispose());
  };
  return group;
}
