import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { pallets, slots, palletBase, arrangeCrates, productIndex } from '../model/layout.ts';
import type { SolveTrace } from '../model/solve_trace.ts';

/** A one-second replay of actual incumbent assignments, not a fabricated branch tree. */
export function createSolveVisual(scene: THREE.Scene, stage: HTMLElement, repaint: () => void, reducedMotion: MediaQueryList) {
  const group = new THREE.Group(); group.name = 'solver-replay'; group.visible = false; scene.add(group);
  const hud = document.createElement('div'); hud.className = 'solve-replay'; hud.hidden = true;
  const caption = document.createElement('span'); caption.className = 'solve-replay-caption'; caption.textContent = 'SOLVER REPLAY';
  const heading = document.createElement('strong'), stats = document.createElement('span');
  hud.append(caption, heading, stats); stage.append(hud);
  const lineMaterial = new LineMaterial({ linewidth: 3.2, vertexColors: true, transparent: true, opacity: .95, toneMapped: false, depthTest: false, depthWrite: false });
  const ghostMaterial = new LineMaterial({ linewidth: 1.5, color: 0xe7354f, transparent: true, opacity: .5, toneMapped: false, depthTest: false, depthWrite: false });
  const pulseMaterial = new THREE.PointsMaterial({ color: 0xe7354f, size: .24, transparent: true, opacity: .95, toneMapped: false, depthTest: false, depthWrite: false });
  const lineGeometry = new LineSegmentsGeometry(), ghostGeometry = new LineSegmentsGeometry(), pulseGeometry = new THREE.BufferGeometry();
  // SSAOPass recognizes this flag when excluding wide lines from its depth/normal pass.
  const lines = Object.assign(new LineSegments2(lineGeometry, lineMaterial), { isLine2: true });
  const ghosts = Object.assign(new LineSegments2(ghostGeometry, ghostMaterial), { isLine2: true });
  const palette = [0xe8344b, 0xf28424, 0x0098c5, 0x8a42db, 0xd92f90];
  const duration = 1000, searchDuration = 650;
  const pulses = new THREE.Points(pulseGeometry, pulseMaterial);
  for (const object of [lines, ghosts, pulses]) { object.renderOrder = 20; object.frustumCulled = false; group.add(object); }
  const sizes = pallets.map((pallet) => ({ width: palletBase.width + .08, depth: palletBase.depth + .08,
    height: palletBase.height + arrangeCrates(pallet.crates).size.height + .08 }));
  const edges = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  let replay: { trace: SolveTrace; before: number[]; after: number[]; start: number } | null = null;
  let curves: THREE.QuadraticBezierCurve3[] = [];
  let stageIndex = -1, stageStarted = 0, vertices = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const point = new THREE.Vector3();

  function clear() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined; replay = null; group.visible = false; hud.hidden = true;
    repaint();
  }
  function build(from: number[], to: number[], final: boolean) {
    const positions: number[] = [], colors: number[] = [], boxes: number[] = [];
    curves = [];
    to.forEach((slot, p) => {
      const target = slots[slot], source = slots[from[p]], size = sizes[p];
      const corners = Array.from({ length: 8 }, (_, i) => [
        target.x + (i & 1 ? 1 : -1) * size.width / 2,
        target.y + (i & 2 ? size.height : 0),
        target.z + (i & 4 ? 1 : -1) * size.depth / 2,
      ]);
      for (const [a, b] of edges) boxes.push(...corners[a], ...corners[b]);
      if (slot === from[p]) return;
      const a = new THREE.Vector3(source.x, source.y + size.height + .1, source.z);
      const b = new THREE.Vector3(target.x, target.y + size.height + .1, target.z);
      const apex = a.clone().lerp(b, .5); apex.y = Math.max(a.y, b.y) + .7 + a.distanceTo(b) * .12;
      const curve = new THREE.QuadraticBezierCurve3(a, apex, b); curves.push(curve);
      const color = new THREE.Color(palette[productIndex(p)]);
      for (let step = 0; step < 28; step++) {
        for (const t of [step / 28, (step + 1) / 28]) {
          curve.getPoint(t, point); positions.push(point.x, point.y, point.z); colors.push(color.r, color.g, color.b);
        }
      }
    });
    // Release previous GPU buffers before replacing a candidate's geometry attributes.
    lineGeometry.dispose(); ghostGeometry.dispose(); pulseGeometry.dispose();
    lineGeometry.setPositions(positions.length ? positions : [0, 0, 0, 0, 0, 0]);
    lineGeometry.setColors(colors.length ? colors : [1, 1, 1, 1, 1, 1]);
    ghostGeometry.setPositions(boxes);
    pulseGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curves.length * 3, 3));
    vertices = positions.length / 3;
    ghostMaterial.color.setHex(final ? 0xe7354f : 0xf17e2a);
    pulseMaterial.color.copy(ghostMaterial.color);
  }
  function update(now: number) {
    if (!replay) return false;
    // A queued animation frame can predate the worker reply that started this replay.
    const elapsed = Math.max(0, now - replay.start);
    if (elapsed >= duration) { clear(); return false; }
    const { trace, before, after } = replay;
    const count = trace.candidates.length;
    const final = reducedMotion.matches || elapsed >= searchDuration || !count;
    const index = final ? count : Math.min(count - 1, Math.floor(elapsed / searchDuration * count));
    if (stageIndex !== index) {
      stageIndex = index; stageStarted = now;
      const placement = final ? after : trace.candidates[index].placement;
      build(before, placement, final);
      heading.textContent = final ? (trace.status === 'OPTIMAL' ? 'Optimal placement' : 'Applied placement')
        : `Solution ${index + 1} / ${count} · ${trace.candidates[index].average.toFixed(1)} s / job`;
    }
    const fade = Math.min(1, elapsed / 35, (duration - elapsed) / 150);
    hud.style.opacity = String(fade);
    lineMaterial.opacity = .95 * fade; ghostMaterial.opacity = (final ? .8 : .5) * fade; pulseMaterial.opacity = fade;
    const reveal = reducedMotion.matches ? 1 : Math.min(1, (now - stageStarted) / 40);
    lineGeometry.instanceCount = Math.floor(vertices * reveal / 2);
    pulses.visible = !reducedMotion.matches;
    const positions = pulseGeometry.getAttribute('position');
    curves.forEach((curve, i) => {
      curve.getPoint((elapsed / 270 + i * .17) % 1, point);
      positions.setXYZ(i, point.x, point.y, point.z);
    });
    positions.needsUpdate = true;
    return true;
  }
  return {
    play(trace: SolveTrace, before: number[], after: number[]) {
      clear();
      replay = { trace, before: [...before], after: [...after], start: performance.now() }; stageIndex = -1;
      stats.textContent = `${Math.round(trace.seconds * 1000)} ms · ${trace.branches.toLocaleString()} branches · ${trace.solutions} solution${trace.solutions === 1 ? '' : 's'}`;
      hud.title = `Replay of recorded feasible solutions. ${trace.conflicts} conflicts. Lines show pallet assignments, not individual search branches.`;
      group.visible = true; hud.hidden = false;
      timer = setTimeout(clear, duration); repaint();
    },
    update, clear,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      scene.remove(group); hud.remove();
      for (const geometry of [lineGeometry, ghostGeometry, pulseGeometry]) geometry.dispose();
      for (const material of [lineMaterial, ghostMaterial, pulseMaterial]) material.dispose();
    },
  };
}
