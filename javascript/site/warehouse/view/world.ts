import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { layout, pallets, palletBase, arrangeCrates, rackName, rackZ, bayX, bayWidth, rackWidth, passage, passageX, rackSegments, slots, warehouse, staging, receiving } from '../model/layout.ts';

export function createWarehouse(scene: THREE.Scene) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometries = new Map<string, THREE.BufferGeometry>();
  function material(color: string) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .82 }));
    return materials.get(color)!;
  }
  function box(parent: THREE.Object3D, size: [number, number, number], pos: [number, number, number], color: string, radius = .025) {
    const key = `${size.join(',')},${radius}`;
    if (!geometries.has(key)) geometries.set(key, radius
      ? new RoundedBoxGeometry(...size, 1, Math.min(radius, Math.min(...size) / 3))
      : new THREE.BoxGeometry(...size));
    const mesh = new THREE.Mesh(geometries.get(key), material(color));
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const textures: THREE.Texture[] = [];
  const labelMaterials: THREE.Material[] = [];
  function floorLabel(text: string, x: number, z: number, width: number, color = '#8a9992', fontSize = 42) {
    const image = document.createElement('canvas'); image.width = 768; image.height = 128;
    const ctx = image.getContext('2d')!;
    ctx.fillStyle = color; ctx.font = `600 ${fontSize}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 384, 64);
    const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }); labelMaterials.push(mat);
    const geometry = new THREE.PlaneGeometry(width, width / 6); geometries.set(`label-${text}`, geometry);
    const mesh = new THREE.Mesh(geometry, mat); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .025, z); scene.add(mesh);
  }

  const depth = warehouse.depth;
  const width = warehouse.width;

  // A low cutaway shell keeps the contents visible while orbiting.
  box(scene, [width, .32, depth], [0, -.18, 0], '#ffffff', .12);
  box(scene, [width - .2, .55, .13], [0, .25, -depth / 2 + .2], '#f2f4f1');
  for (const x of [-width / 2 + .2, width / 2 - .2]) box(scene, [.13, .55, depth - .45], [x, .25, 0], '#f2f4f1');
  for (let x = -width / 2 + 1; x <= width / 2 - 1; x += 1) box(scene, [.015, .008, depth - .9], [x, -.012, 0], '#e8ede9', 0);
  for (let z = -Math.floor(depth / 2) + 1; z <= Math.floor(depth / 2) - 1; z += 1) box(scene, [width - .6, .008, .015], [0, -.012, z], '#e8ede9', 0);
  for (let aisle = 0; aisle < layout.racks - 1; aisle++) {
    const z = rackZ(aisle) + layout.rackSpacing / 2;
    for (let x = -rackWidth / 2; x <= rackWidth / 2; x += .65)
      for (const dz of [-.65, .65]) box(scene, [.32, .012, .025], [x, .005, z + dz], '#c2cec3', 0);
    floorLabel(`A I S L E   ${aisle + 1}`, 0, z, 3);
  }
  for (const zone of [
    { ...receiving, label: 'RECEIVING', fill: '#cde6d8', edge: '#5d9a79', direction: -1 },
    { ...staging, label: 'DISPATCH', fill: '#d1dfee', edge: '#628bad', direction: 1 },
  ]) {
    box(scene, [3.8, .32, 4], [zone.x, -.18, depth / 2 + 2], '#ffffff', .08);
    box(scene, [3, .01, 2.4], [zone.x, .005, zone.z], zone.fill, 0);
    for (const dx of [-1.5, 1.5]) box(scene, [.045, .01, 2.4], [zone.x + dx, .014, zone.z], zone.edge, 0);
    for (const dz of [-1.2, 1.2]) box(scene, [3, .01, .045], [zone.x, .014, zone.z + dz], zone.edge, 0);
    floorLabel(zone.label, zone.x, zone.z + 1.8, 3.2, zone.edge, 104);
    // Flat directional arrow: incoming loads point into storage, outgoing loads toward the edge.
    box(scene, [.09, .01, .65], [zone.x, .018, zone.z], zone.edge, 0);
    for (const side of [-1, 1]) box(scene, [.065, .01, .38], [zone.x + side * .12, .018, zone.z + zone.direction * .23], zone.edge, 0).rotation.y = -side * zone.direction * Math.PI / 4;
  }

  const shelves: { object: THREE.Group; level: number }[] = [];
  const rackFrames: THREE.Group[] = [], slotRacks: THREE.Group[] = [];
  const uprightHeight = .35 + (layout.levels - 1) * layout.levelHeight + .065;
  for (let rack = 0; rack < layout.racks; rack++) floorLabel(rackName(rack), -width / 2 + 1, rackZ(rack), .8, '#60776c');
  for (const segment of rackSegments) {
    const { rack, z, minX, maxX, bays } = segment;
    const span = maxX - minX, center = (minX + maxX) / 2;
    const frame = new THREE.Group(); frame.matrixAutoUpdate = false; scene.add(frame); rackFrames.push(frame);
    slots.filter((slot) => slot.rack === rack && bays.includes(slot.bay)).forEach((slot) => slotRacks[slot.id] = frame);
    for (let upright = 0; upright <= bays.length; upright++) {
      const x = minX + upright * bayWidth(rack);
      for (const dz of [-.88, .88]) {
        box(frame, [.075, uprightHeight, .075], [x, uprightHeight / 2, z + dz], '#e1e8e3');
        box(scene, [.19, .08, .19], [x, .06, z + dz], '#bac7bf');
      }
    }
    for (let level = 0; level < layout.levels; level++) {
      const group = new THREE.Group(); frame.add(group); shelves.push({ object: group, level });
      const y = .35 + level * layout.levelHeight;
      box(group, [span, .075, 1.78], [center, y, z], '#f0f3ef');
      for (const dz of [-.88, .88]) box(group, [span + .05, .13, .075], [center, y, z + dz], '#d1ddd4');
      for (const bay of bays) {
        const x = bayX(bay, rack);
        box(group, [.32, .065, .009], [x, y, z + .923], '#a8b9ae', 0);
        if (level === 0) floorLabel(`${rackName(rack)}${bay + 1}`, x, z + 1.15, .65, '#60776c');
      }
    }
    for (const x of [minX - .18, maxX + .18]) box(scene, [.12, .36, 2.05], [x, .18, z], '#e8dfbd');
  }
  // A real opening through the middle rack, with subtle floor markings for the shortcut.
  for (const x of [passageX - .95, passageX + .95]) for (let z = rackZ(passage.rack) - 1.6; z <= rackZ(passage.rack) + 1.6; z += .55)
    box(scene, [.025, .012, .28], [x, .005, z], '#aebfb3', 0);
  floorLabel('PASSAGE', passageX, rackZ(passage.rack), 1.8, '#789286', 70);

  const palletGroups: THREE.Group[] = [];
  const pickTargets: THREE.Object3D[] = [];
  pallets.forEach((pallet, i) => {
    const group = new THREE.Group();
    const slot = slots[pallet.slot];
    group.position.set(slot.x, slot.y, slot.z);
    group.userData.pallet = i; slotRacks[slot.id].add(group); palletGroups.push(group);
    for (const x of [-.61, 0, .61]) box(group, [.15, .13, 1.25], [x, .07, 0], '#d9c5a2');
    for (let slat = 0; slat < 5; slat++) box(group, [1.65, .055, .19], [0, .16, -.5 + slat * .25], '#e3d2b2', .012);
    const load = arrangeCrates(pallet.crates);
    for (const { crate, position } of load.boxes) {
      const { width, height, depth } = crate.size;
      const carton = box(group, [width, height, depth], position, pallet.product.color, .035);
      carton.userData.pallet = i; pickTargets.push(carton);
    }
    // Straps and labels follow the actual crate envelope.
    const { width, height: h, depth } = load.size;
    const base = palletBase.height, front = depth / 2;
    for (const x of [-width * .3, width * .3]) {
      box(group, [.045, h, .008], [x, base + h / 2, front + .004], '#f5f0e5', 0);
      box(group, [.045, .008, depth], [x, base + h + .004, 0], '#f5f0e5', 0);
    }
    box(group, [.23, .15, .014], [.13, base + h * .6, front + .009], '#fffdf4', .008);
    for (let line = 0; line < 4; line++) box(group, [.008, .065, .003], [.06 + line * .025, base + h * .6, front + .018], '#a1a699', 0);

  });

  // Rotate around the middle of the truck + load footprint; local forward is -Z.
  const forklift = new THREE.Group();
  forklift.name = 'forklift';
  const body = new THREE.Group(); body.position.z = .7; forklift.add(body);
  // The chassis can settle under load while the wheels and lifting mechanism stay aligned.
  const wheels = new THREE.Group(); wheels.position.z = .7; forklift.add(wheels);
  const carriage = new THREE.Group(); forklift.add(carriage);
  scene.add(forklift);
  box(body, [.91, .3, 1.35], [0, .39, 0], '#dcae54');
  box(body, [.94, .51, .43], [0, .64, .47], '#e8bf69'); // Counterweight.
  box(body, [.78, .09, .8], [0, .59, -.12], '#58615c'); // Cab floor.
  box(body, [.43, .12, .4], [0, .77, .13], '#48524e');
  box(body, [.43, .4, .1], [0, .96, .3], '#48524e'); // Seat back.
  box(body, [.07, .4, .07], [0, .81, -.37], '#66716a');
  box(body, [.33, .045, .15], [0, 1.02, -.37], '#46534b'); // Steering control.
  // A few blocks are enough for a seated driver, helmet, and hands on the controls.
  box(body, [.29, .4, .23], [0, 1.13, .14], '#7faaa1');
  box(body, [.2, .2, .18], [0, 1.42, .07], '#d9ac83');
  box(body, [.26, .09, .24], [0, 1.54, .07], '#f2d27a');
  for (const side of [-1, 1]) {
    box(body, [.12, .12, .34], [side * .1, .88, -.02], '#647782');
    box(body, [.12, .27, .12], [side * .1, .74, -.2], '#647782');
    box(body, [.13, .08, .22], [side * .1, .64, -.25], '#48554c');
    box(body, [.09, .28, .09], [side * .19, 1.16, -.02], '#7faaa1').rotation.x = .7;
    box(body, [.09, .09, .28], [side * .17, 1.04, -.22], '#7faaa1');
    box(body, [.085, .08, .08], [side * .17, 1.04, -.37], '#d9ac83');
  }
  for (const x of [-.37, .37]) {
    for (const z of [-.39, .4]) box(body, [.045, 1.04, .045], [x, 1.08, z], '#69786d', 0);
    box(body, [.065, .07, .91], [x, 1.63, 0], '#69786d', 0);
  }
  for (const z of [-.43, 0, .43]) box(body, [.81, .055, .065], [0, 1.63, z], '#69786d', 0);
  for (const x of [-.27, .27]) {
    box(forklift, [.075, 1.65, .1], [x, .97, -.03], '#6b7770', 0); // Mast.
    box(carriage, [.09, .08, 1.25], [x, .0925, -.655], '#829087', .012); // Forks support the full pallet depth.
  }
  box(forklift, [.62, .12, .12], [0, 1.75, -.03], '#6b7770', 0);
  box(carriage, [.66, .35, .09], [0, .28, -.03], '#89968d', 0);
  const tire = new THREE.CylinderGeometry(.23, .23, .13, 12);
  const hub = new THREE.CylinderGeometry(.11, .11, .145, 12);
  geometries.set('forklift-tire', tire); geometries.set('forklift-hub', hub);
  for (const x of [-.47, .47]) for (const z of [-.43, .45]) {
    for (const [geometry, color] of [[tire, '#424d47'], [hub, '#aab5ab']] as const) {
      const wheel = new THREE.Mesh(geometry, material(color));
      wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .23, z);
      wheel.castShadow = true; wheel.receiveShadow = true; wheels.add(wheel);
    }
  }

  // Two overlapping inner sections telescope vertically; the forks never extend forward.
  const mastStages = [.19, .13].map((halfWidth) => {
    const section = new THREE.Group(); forklift.add(section);
    for (const x of [-halfWidth, halfWidth]) box(section, [.045, 1.6, .055], [x, .95, -.03], '#94a298', 0);
    box(section, [halfWidth * 2 + .05, .07, .055], [0, 1.73, -.03], '#94a298', 0);
    return section;
  });

  // Batch boxes per material, retaining separate groups for movable pallets and forks.
  for (const group of [scene, ...rackFrames, ...shelves.map(({ object }) => object), ...palletGroups, forklift, body, wheels, carriage, ...mastStages]) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) continue;
      const batch = batches.get(child.material) ?? []; batch.push(child); batches.set(child.material, batch);
    }
    for (const [mat, meshes] of batches) {
      if (meshes.length < 2) continue;
      const parts = meshes.map((mesh) => {
        mesh.updateMatrix();
        return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(parts);
      parts.forEach((part) => part.dispose());
      if (!geometry) throw new Error('Cannot batch warehouse geometry.');
      geometries.set(`batch-${geometries.size}`, geometry);
      const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = true; mesh.receiveShadow = true;
      group.remove(...meshes); group.add(mesh);
    }
  }
  pickTargets.length = 0;
  palletGroups.forEach((group, i) => group.children.forEach((mesh) => { mesh.userData.pallet = i; pickTargets.push(mesh); }));

  function dispose() {
    geometries.forEach((geometry) => geometry.dispose()); materials.forEach((mat) => mat.dispose());
    textures.forEach((texture) => texture.dispose()); labelMaterials.forEach((mat) => mat.dispose());
  }
  return { shelves, rackFrames, slotRacks, palletGroups, pickTargets, forklift, chassis: body, carriage, mastStages, dispose };
}
