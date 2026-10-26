import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWarehouse } from './world.ts';
import { pallets, slots, rackName, staging, receiving, warehouse, shelfWeightLimits } from '../model/layout.ts';
import { WarehouseSimulation } from '../model/simulation.ts';
import { createDashboard } from '../dashboard.ts';
import { createSolveVisual } from './solve_visual.ts';
import { createStabilityVisual } from './stability_visual.ts';
import { createSpillVisual } from './spill_visual.ts';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { requiredElement } from '../../site_support.js';

export function startWarehouseScene() {
  const canvas = requiredElement('warehouse-canvas', 'canvas');
  const stage = requiredElement('warehouse-stage', 'div');
  const errorEl = requiredElement('scene-error', 'p');
  const pauseButton = requiredElement('pause-forklift', 'button');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const frameInterval = 1000 / 45;
  const simulationRate = 4;
  const workbench = requiredElement('warehouse-workbench', 'div');
  const fitWorkbench = () => {
    const top = workbench.getBoundingClientRect().top + window.scrollY;
    workbench.style.height = `${Math.max(420, Math.min(650, window.innerHeight - top - 16))}px`;
  };
  fitWorkbench();
  window.addEventListener('resize', fitWorkbench);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  // A bright studio backdrop remains near-white after the exposure/tone-mapping pass.
  scene.background = new THREE.Color().setRGB(2.6, 2.7, 2.65);
  const camera = new THREE.OrthographicCamera(-10, 10, 8, -8, .1, 100);
  const focus = new THREE.Vector3(0, 1.6, 0);
  camera.position.set(14, 13, 17);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(focus);
  controls.enableDamping = true;
  controls.dampingFactor = .13;
  controls.enablePan = false;
  controls.minZoom = .65;
  controls.maxZoom = 2.5;
  controls.minPolarAngle = .015;
  controls.maxPolarAngle = Math.PI / 2 - .025;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8d2c8, 2.1));
  const sunlight = new THREE.DirectionalLight(0xfffaf1, 2.6);
  sunlight.position.set(-7, 16, 10);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: .5, far: 45 });
  sunlight.shadow.normalBias = .025;
  sunlight.shadow.bias = -.00015;
  sunlight.shadow.radius = 4;
  scene.add(sunlight);

  const composer = new EffectComposer(renderer);
  composer.renderTarget1.samples = 4;
  composer.renderTarget2.samples = 4;
  composer.addPass(new RenderPass(scene, camera));
  const ao = new SSAOPass(scene, camera, 1, 1, 16);
  // SSAOPass defaults to perspective depth reconstruction; this scene is orthographic.
  ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA = 0;
  ao.depthRenderMaterial.defines.PERSPECTIVE_CAMERA = 0;
  ao.kernelRadius = .45;
  ao.minDistance = .0005;
  ao.maxDistance = .035;
  composer.addPass(ao);
  const output = new OutputPass();
  composer.addPass(output);

  const world = createWarehouse(scene);
  const { palletGroups, pickTargets } = world;
  const simulation = new WarehouseSimulation();
  const stability = createStabilityVisual(world, simulation, requiredElement('shelf-stability', 'p'));
  const spill = createSpillVisual(scene, requiredElement('spill-status', 'p'));
  let running = !reducedMotion.matches;
  let lastFrame = 0;
  let renderClock = 0;
  let payloadStance = 0;
  updatePlaybackControl();

  let selected = 0;
  const selection = new THREE.BoxHelper(palletGroups[0], 0x537d6b);
  selection.material.depthTest = false;
  selection.material.transparent = true;
  selection.material.opacity = .65;
  selection.renderOrder = 10;
  selection.visible = false;
  scene.add(selection);
  let frame = 0;
  let dirty = true;
  let disposed = false;
  type CameraTransition = { start: number; from: THREE.Spherical; to: THREE.Spherical; zoom: number; targetZoom: number };
  let transition: CameraTransition | null = null;
  let palletFlight: { start: number; moves: Map<number, { from: THREE.Vector3; to: THREE.Vector3 }> } | null = null;
  const clock = () => performance.now();
  const solveVisual = createSolveVisual(scene, stage, requestRender, reducedMotion);
  function requestRender() {
    if (disposed) return;
    dirty = true;
    if (!frame && !document.hidden) frame = requestAnimationFrame(render);
  }
  function render(now: number) {
    frame = 0;
    if (disposed || document.hidden) { lastFrame = 0; renderClock = 0; return; }
    if (renderClock && now - renderClock < frameInterval) { requestRender(); return; }
    // Keep fractional frame time: resetting to `now` would lock a 60 Hz display to 30 FPS.
    renderClock = renderClock ? now - (now - renderClock) % frameInterval : now;
    const realDt = lastFrame ? Math.max(0, (now - lastFrame) / 1000) : 0;
    const dt = Math.min(.25, realDt);
    lastFrame = now;
    // Give rearranged pallets time to land before the forklift can start its next pickup.
    if (running && !palletFlight) {
      const condition = simulation.advanceConditions(realDt);
      if (condition) { solveVisual.clear(); dashboard.publish(condition); }
      simulation.advance(dt * simulationRate); syncSimulation(dt); dirty = true;
    }
    if (animatePalletFlight(now)) dirty = true;
    const replaying = solveVisual.update(now);
    if (replaying) dirty = true;
    if (transition) {
      const t = reducedMotion.matches ? 1 : Math.min(1, (now - transition.start) / 430);
      const ease = t * t * (3 - 2 * t);
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(transition.from.radius, transition.to.radius, ease),
        THREE.MathUtils.lerp(transition.from.phi, transition.to.phi, ease),
        THREE.MathUtils.lerp(transition.from.theta, transition.to.theta, ease),
      );
      camera.position.copy(focus).add(new THREE.Vector3().setFromSpherical(s));
      camera.zoom = THREE.MathUtils.lerp(transition.zoom, transition.targetZoom, ease);
      camera.updateProjectionMatrix();
      if (t === 1) { transition = null; controls.enabled = true; canvas.setAttribute('aria-busy', 'false'); }
      dirty = true;
    }
    controls.update();
    if (dirty) {
      dirty = false;
      ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
      ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
      composer.render();
    }
    if (transition || running || replaying || palletFlight) requestRender();
  }
  controls.addEventListener('change', requestRender);
  controls.addEventListener('start', () => {
    transition = null;
  });

  function updatePlaybackControl() {
    const label = running ? 'Pause' : 'Resume';
    pauseButton.setAttribute('aria-label', label); pauseButton.title = label;
    pauseButton.dataset.paused = String(!running);
  }
  function startPalletFlight() {
    const moves = new Map<number, { from: THREE.Vector3; to: THREE.Vector3 }>();
    if (!reducedMotion.matches) simulation.locations.forEach((location, i) => {
      if (location.kind !== 'slot') return;
      const slot = slots[location.slot], to = new THREE.Vector3(slot.x, slot.y, slot.z);
      const from = palletGroups[i].getWorldPosition(new THREE.Vector3());
      if (from.distanceToSquared(to) > .000001) moves.set(i, { from, to });
    });
    // Repeated button clicks retarget from the current visible position, including mid-flight.
    palletFlight = moves.size ? { start: clock(), moves } : null;
  }
  function animatePalletFlight(now: number) {
    if (!palletFlight) return false;
    const t = reducedMotion.matches ? 1 : THREE.MathUtils.clamp((now - palletFlight.start) / 200, 0, 1);
    const ease = t * t * (3 - 2 * t);
    for (const [i, { from, to }] of palletFlight.moves) {
      const position = palletGroups[i].position;
      position.lerpVectors(from, to, ease);
      if (t < 1) position.y += Math.sin(Math.PI * ease) * .6;
    }
    selection.setFromObject(palletGroups[selected]);
    if (t === 1) { palletFlight = null; syncSimulation(); }
    return true;
  }
  function syncSimulation(dt = 0) {
    const f = simulation.forklift;
    world.forklift.position.set(f.x, 0, f.z); world.forklift.rotation.y = f.yaw;
    const payload = f.load === null ? 0 : Math.min(1, pallets[f.load].weight / warehouse.maxPayload);
    payloadStance = reducedMotion.matches ? payload : THREE.MathUtils.lerp(payloadStance, payload, 1 - Math.exp(-10 * dt));
    world.chassis.position.y = -.035 * payloadStance;
    world.chassis.rotation.x = -.045 * payloadStance;
    world.carriage.position.set(0, f.lift, 0);
    const extension = Math.max(0, f.lift + .5 - 1.73);
    world.mastStages.forEach((section, i) => section.position.y = extension * (i + 1) / world.mastStages.length);
    simulation.locations.forEach((location, i) => {
      const group = palletGroups[i];
      const parent = location.kind === 'forklift' ? world.carriage
        : location.kind === 'slot' && !palletFlight?.moves.has(i) ? world.slotRacks[location.slot] : scene;
      if (group.parent !== parent) parent.add(group);
      if (location.kind === 'slot' && palletFlight?.moves.has(i)) return;
      if (location.kind === 'forklift') { group.position.set(0, 0, -warehouse.loadOffset); group.rotation.y = 0; }
      else {
        const position = location.kind === 'slot' ? slots[location.slot] : location.kind === 'receiving' ? receiving : staging;
        group.position.set(position.x, position.y, position.z);
        group.rotation.y = location.kind === 'slot' ? 0 : Math.PI;
      }
    });
    stability.update(dt, reducedMotion.matches, palletFlight?.moves);
    spill.update(simulation);
    selection.setFromObject(palletGroups[selected]);
  }
  function selectPallet(index: number) {
    selected = index; selection.visible = true;
    const slot = slots[simulation.placement[index]];
    moveStatus.textContent = `${pallets[index].id} · ${pallets[index].weight} kg · Level ${slot.level + 1} limit: ${shelfWeightLimits[slot.level]} kg`;
    syncSimulation(); requestRender();
  }
  pauseButton.addEventListener('click', () => {
    running = !running; lastFrame = 0; updatePlaybackControl();
    syncSimulation(); requestRender();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { running = false; updatePlaybackControl(); syncSimulation(); requestRender(); }
  });
  const moveStatus = requiredElement('move-status', 'p');
  let solvingWasRunning = false;
  const dashboard = createDashboard(simulation, {
    changed(animatePlacement) {
      solveVisual.clear();
      if (animatePlacement) startPalletFlight();
      syncSimulation(); requestRender();
    },
    solved(trace, before, after) { solveVisual.play(trace, before, after); },
    solving(active) {
      if (active) { solveVisual.clear(); solvingWasRunning = running; running = false; }
      else running = solvingWasRunning;
      pauseButton.disabled = active;
      lastFrame = 0; updatePlaybackControl();
      syncSimulation(); requestRender();
    },
  });
  function movePallet(index: number, slot: number) {
    if (dashboard.busy || !simulation.movePallet(index, slot)) {
      moveStatus.textContent = 'That slot is reserved or the load does not fit. Try another slot.'; return;
    }
    const target = slots[slot];
    solveVisual.clear();
    moveStatus.textContent = `${pallets[index].id} moved to ${rackName(target.rack)}${target.bay + 1}, level ${target.level + 1}.`;
    dashboard.publish('Pallet moved'); syncSimulation(); requestRender();
  }

  const raycaster = new THREE.Raycaster();
  const pointerRay = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
  };
  const dropGeometry = new THREE.BoxGeometry(1.85, 1.15, 1.45);
  const dropMaterial = new THREE.MeshBasicMaterial({ color: 0x6d9d84, transparent: true, opacity: .22, wireframe: true, depthTest: false, depthWrite: false });
  const hoverMaterial = new THREE.MeshBasicMaterial({ color: 0x367b55, transparent: true, opacity: .65, wireframe: true, depthTest: false, depthWrite: false });
  const dropTargets = slots.map((slot) => {
    const mesh = new THREE.Mesh(dropGeometry, dropMaterial);
    mesh.position.set(slot.x, slot.y + .575, slot.z); mesh.userData.slot = slot.id;
    mesh.visible = false; mesh.renderOrder = 11; world.slotRacks[slot.id].add(mesh); return mesh;
  });
  let drag: { pointer: number; pallet: number; x: number; y: number; moved: boolean; target: number | null; resume: boolean } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || dashboard.busy || transition || palletFlight) return;
    pointerRay(event);
    const hit = raycaster.intersectObjects(pickTargets, false)[0];
    if (!hit) return;
    const index = hit.object.userData.pallet as number;
    selectPallet(index);
    if ((!simulation.idle && index === simulation.job.pallet) || simulation.locations[index].kind !== 'slot') {
      selection.visible = false;
      moveStatus.textContent = 'This pallet is part of the active job. Move another pallet while the forklift finishes.'; return;
    }
    event.stopImmediatePropagation(); event.preventDefault();
    solveVisual.clear();
    controls.enableDamping = false; controls.update(); controls.enableDamping = true; controls.enabled = false;
    drag = { pointer: event.pointerId, pallet: index, x: event.clientX, y: event.clientY, moved: false, target: null, resume: running };
    running = false; lastFrame = 0; canvas.setPointerCapture(event.pointerId);
  }, true);
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    event.stopImmediatePropagation();
    drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5;
    if (!drag.moved) return;
    if (palletGroups[drag.pallet].parent !== scene) { scene.attach(palletGroups[drag.pallet]); palletGroups[drag.pallet].quaternion.identity(); palletGroups[drag.pallet].scale.setScalar(1); }
    dropTargets.forEach((mesh, slot) => { mesh.visible = simulation.canMove(drag!.pallet, slot); mesh.material = dropMaterial; });
    scene.updateMatrixWorld(true); pointerRay(event);
    const hit = raycaster.intersectObjects(dropTargets.filter((mesh) => mesh.visible), false)[0];
    drag.target = hit ? hit.object.userData.slot as number : null;
    if (drag.target !== null) {
      const target = slots[drag.target]; dropTargets[drag.target].material = hoverMaterial;
      palletGroups[drag.pallet].position.copy(world.slotRacks[target.id].localToWorld(new THREE.Vector3(target.x, target.y, target.z)));
      moveStatus.textContent = `Release at ${rackName(target.rack)}${target.bay + 1}, level ${target.level + 1} to move or swap.`;
    } else {
      const location = simulation.locations[drag.pallet];
      if (location.kind === 'slot') {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -slots[location.slot].y);
        const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
        if (point) palletGroups[drag.pallet].position.copy(point);
      }
      moveStatus.textContent = 'Release over a highlighted shelf slot. Escape cancels.';
    }
    selection.setFromObject(palletGroups[drag.pallet]); requestRender();
  }, true);
  function finishDrag(commit: boolean) {
    if (!drag) return;
    const finished = drag; drag = null;
    if (canvas.hasPointerCapture(finished.pointer)) canvas.releasePointerCapture(finished.pointer);
    dropTargets.forEach((mesh) => mesh.visible = false); selection.visible = false;
    controls.enabled = true; running = finished.resume; lastFrame = 0;
    if (commit && finished.moved && finished.target !== null) movePallet(finished.pallet, finished.target);
    else if (finished.moved) moveStatus.textContent = 'Move cancelled. The pallet stays in its original slot.';
    syncSimulation(); requestRender();
  }
  canvas.addEventListener('pointerup', (event) => { if (drag) { event.stopImmediatePropagation(); finishDrag(true); } }, true);
  canvas.addEventListener('pointercancel', () => finishDrag(false));
  canvas.addEventListener('lostpointercapture', () => finishDrag(false));
  const cancelDrag = (event: KeyboardEvent) => { if (event.key === 'Escape') finishDrag(false); };
  document.addEventListener('keydown', cancelDrag);

  function resetCamera() {
    const position = new THREE.Vector3(14, 13, 17);
    // Flush residual drag damping before taking control of the camera.
    controls.enableDamping = false; controls.update(); controls.enableDamping = true;
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(focus));
    const to = new THREE.Spherical().setFromVector3(position.clone().sub(focus));
    to.theta = from.theta + Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
    transition = { start: clock(), from, to, zoom: camera.zoom, targetZoom: 1 };
    canvas.setAttribute('aria-busy', 'true');
    controls.enabled = false;
    requestRender();
  }
  requiredElement('reset-view', 'button').addEventListener('click', resetCamera);
  function zoom(factor: number) {
    const zoom = THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom);
    if (transition) { transition.targetZoom = zoom; return; }
    const position = new THREE.Spherical().setFromVector3(camera.position.clone().sub(focus));
    transition = { start: clock(), from: position, to: position.clone(), zoom: camera.zoom, targetZoom: zoom };
    canvas.setAttribute('aria-busy', 'true');
    controls.enabled = false; requestRender();
  }
  requiredElement('zoom-in', 'button').addEventListener('click', () => zoom(1.2));
  requiredElement('zoom-out', 'button').addEventListener('click', () => zoom(1 / 1.2));

  const resizeObserver = new ResizeObserver(() => {
    const width = stage.clientWidth, height = stage.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    // Fit the whole warehouse on narrow screens as well as the desktop canvas.
    const halfHeight = Math.max(12, 15 / aspect);
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
    camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    // Recreate color attachments on resize, avoiding stale framebuffer storage.
    const pixels = renderer.getDrawingBufferSize(new THREE.Vector2());
    composer.reset(new THREE.WebGLRenderTarget(pixels.x, pixels.y, { type: THREE.HalfFloatType, samples: 4 }));
    composer.setSize(width, height);
    requestRender();
  });
  resizeObserver.observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) finishDrag(false); lastFrame = 0; requestRender(); });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); running = false; errorEl.hidden = false;
    errorEl.textContent = 'The 3D view lost its graphics connection. Reload the page to restore it.';
  });
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    disposed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); controls.dispose();
    window.removeEventListener('resize', fitWorkbench);
    dashboard.dispose(); solveVisual.dispose(); stability.dispose(); spill.dispose(); document.removeEventListener('keydown', cancelDrag);
    dropGeometry.dispose(); dropMaterial.dispose(); hoverMaterial.dispose();
    world.dispose();
    selection.geometry.dispose(); selection.material.dispose();
    // Runtime spelling is dispose; older @types/three releases spell this dipose.
    (ao as unknown as { dispose(): void }).dispose(); output.dispose(); composer.dispose(); renderer.dispose();
  });
  canvas.dataset.ready = 'true';
  syncSimulation(); requestRender();
}
