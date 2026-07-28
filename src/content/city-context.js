// Render-only authored-city surroundings. Receives THREE from main so content
// keeps the repository's import boundary. Every descriptor is deterministic
// pure data from districts.js; these meshes never enter collision, spatial
// hashes, progression mass, or saves.

function material(THREE, color, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

export function createCityContext(THREE, descriptor) {
  const group = new THREE.Group();
  group.name = `city-context-${descriptor && descriptor.id ? descriptor.id : 'none'}`;
  if (!descriptor || descriptor.id !== 'chicago-loop') return group;

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

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x397e9f, roughness: 0.34, metalness: 0.05,
  });
  for (const [i, rec] of (descriptor.water || []).entries()) {
    const geo = new THREE.PlaneGeometry(rec.w, rec.d);
    const mesh = new THREE.Mesh(geo, waterMat);
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
