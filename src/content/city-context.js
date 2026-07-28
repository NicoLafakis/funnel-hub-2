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

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x397e9f, roughness: 0.34, metalness: 0.05,
  });
  for (const [i, rec] of (descriptor.water || []).entries()) {
    const geo = new THREE.PlaneGeometry(rec.w, rec.d);
    const mesh = new THREE.Mesh(geo, waterMat);
    mesh.name = `chicago-river-${i}`;
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rec.rotY || 0;
    mesh.position.set(rec.x, -0.35, rec.z);
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  const palette = [0x756f6a, 0x8b765f, 0x67747b, 0x625f70];
  const buildings = descriptor.buildings || [];
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildingMeshes = palette.map((color, tone) => {
    const records = buildings.filter((b) => b.tone === tone);
    const mesh = new THREE.InstancedMesh(buildingGeo, material(THREE, color), records.length);
    mesh.name = `chicago-context-buildings-${tone}`;
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
  });

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
    buildingGeo.dispose();
    waterMat.dispose();
    railMat.dispose();
    tieMat.dispose();
    for (const mesh of buildingMeshes) mesh.material.dispose();
    group.traverse((node) => {
      if (node.isMesh && node.geometry !== buildingGeo && node.geometry) node.geometry.dispose();
    });
  };
  return group;
}
