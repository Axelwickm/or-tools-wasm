import * as THREE from 'three';
import { spillSites } from '../model/disruptions.ts';
import type { WarehouseSimulation } from '../model/simulation.ts';

export function createSpillVisual(scene: THREE.Scene, note: HTMLElement) {
  const group = new THREE.Group(); scene.add(group); group.visible = false;
  const outline = new THREE.Shape();
  for (let i = 0; i <= 16; i++) {
    const angle = i % 16 / 16 * Math.PI * 2, radius = .78 + .12 * Math.sin(angle * 3) + .08 * Math.cos(angle * 5);
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * 1.12;
    if (i === 0) outline.moveTo(x, y); else outline.lineTo(x, y);
  }
  const oil = new THREE.Mesh(new THREE.ShapeGeometry(outline), new THREE.MeshStandardMaterial({ color: '#353841', roughness: .22, metalness: .15 }));
  oil.rotation.x = -Math.PI / 2; oil.position.y = .02; group.add(oil);
  const base = new THREE.BoxGeometry(.32, .055, .32), cone = new THREE.ConeGeometry(.12, .4, 5), band = new THREE.CylinderGeometry(.055, .078, .08, 5);
  const orange = new THREE.MeshStandardMaterial({ color: '#ed9954', roughness: .8 });
  const white = new THREE.MeshStandardMaterial({ color: '#fff4de', roughness: .8 });
  for (const x of [-.95, .95]) for (const z of [-.95, .95]) {
    for (const [geometry, material, y] of [[base, orange, .04], [cone, orange, .26], [band, white, .24]] as const) {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; group.add(mesh);
    }
  }
  return {
    update(simulation: WarehouseSimulation) {
      const site = simulation.blockedPassage === null ? null : spillSites[simulation.blockedPassage];
      group.visible = Boolean(site); note.hidden = !site;
      if (!site) return;
      group.position.set(site.x, 0, site.z);
      const text = `Oil spill · ${site.label} blocked · ${Math.ceil(simulation.spillRemaining)}s`;
      if (note.textContent !== text) note.textContent = text;
    },
    dispose() {
      group.removeFromParent(); oil.geometry.dispose(); oil.material.dispose();
      base.dispose(); cone.dispose(); band.dispose(); orange.dispose(); white.dispose();
    },
  };
}
