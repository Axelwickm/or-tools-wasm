import { products, defaultDemand } from './model/layout.ts';
import { randomPlacement } from './model/efficiency.ts';
import type { WarehouseSimulation } from './model/simulation.ts';
import type { WorkerRequest, WorkerReply } from './worker.ts';
import { requiredElement } from '../site_support.js';
import type { SolveTrace } from './model/solve_trace.ts';

export function createDashboard(simulation: WarehouseSimulation, hooks: {
  changed(animatePlacement?: boolean): void; solving(active: boolean): void;
  solved(trace: SolveTrace, before: number[], after: number[]): void;
}) {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const send = (message: WorkerRequest) => worker.postMessage(message);
  const optimize = requiredElement('optimize-placement', 'button');
  const randomize = requiredElement('randomize-placement', 'button');
  const status = requiredElement('placement-status', 'p');
  const demands = requiredElement('product-demand', 'div');
  const average = requiredElement('efficiency-average', 'span');
  const detail = requiredElement('efficiency-detail', 'span');
  const chart = document.querySelector<SVGSVGElement>('#efficiency-chart')!;
  const started = performance.now();
  const now = () => (performance.now() - started) / 1000;
  const points: { t: number; value: number | null }[] = [];
  const markers: { t: number; label: string }[] = [];
  let busy = false, failed = false;
  const sliders = products.map((product, i) => {
    const label = document.createElement('label'); label.className = 'demand-control';
    label.style.setProperty('--product-color', product.color);
    const name = document.createElement('span'); name.textContent = product.name;
    const input = document.createElement('input');
    input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '5'; input.value = String(defaultDemand[i]);
    input.id = `demand-${i}`; input.setAttribute('aria-label', `${product.name} demand`);
    input.setAttribute('aria-orientation', 'vertical');
    const output = document.createElement('output'); output.htmlFor = input.id; output.textContent = input.value;
    input.addEventListener('input', () => {
      output.textContent = input.value;
      simulation.setDemand(sliders.map((slider) => Number(slider.value)));
      publish('Demand changed'); hooks.changed();
    });
    label.append(output, input, name); demands.append(label); return input;
  });
  const snapshot = () => ({ placement: [...simulation.placement], demand: [...simulation.demand], locked: simulation.idle ? [] : [simulation.job.pallet], blockedPassage: simulation.blockedPassage });
  function publish(label?: string) {
    send({ kind: 'snapshot', revision: simulation.revision, snapshot: snapshot() });
    if (label) {
      const last = markers[markers.length - 1];
      // A slider gesture is one event on the timeline, not a forest of markers.
      if (last?.label === label && now() - last.t < 1) last.t = now();
      else markers.push({ t: now(), label });
    }
    optimize.disabled = busy || failed || !simulation.demand.some(Boolean);
  }
  function setBusy(value: boolean) {
    busy = value;
    optimize.textContent = value ? 'Optimizing…' : 'Optimize placement';
    optimize.disabled = value || failed || !simulation.demand.some(Boolean);
    sliders.forEach((input) => input.disabled = value);
    randomize.disabled = value;
    hooks.solving(value);
  }
  optimize.addEventListener('click', () => {
    if (busy || failed) return;
    setBusy(true); status.textContent = 'Optimizing within shelf limits…';
    send({ kind: 'optimize', revision: simulation.revision, snapshot: snapshot() });
  });
  randomize.addEventListener('click', () => {
    if (busy) return;
    simulation.applyPlacement(randomPlacement(snapshot()));
    publish('Placement randomized'); hooks.changed(true);
    status.textContent = 'Placement randomized';
  });
  function draw() {
    const end = Math.max(30, now()), start = Math.max(0, end - 120), span = end - start;
    const visible = points.filter((point) => point.t >= start);
    const values = visible.flatMap((point) => point.value === null ? [] : [point.value]);
    const minimum = values.length ? Math.min(...values) : 0;
    const maximum = values.length ? Math.max(...values) : 1;
    const padding = Math.max(.25, (maximum - minimum) * .12);
    const low = Math.max(0, Math.floor((minimum - padding) * 10) / 10);
    const high = Math.ceil((maximum + padding) * 10) / 10;
    const x = (t: number) => 46 + (t - start) / span * 730;
    const y = (value: number) => 120 - (value - low) / (high - low) * 88;
    let pen = false;
    const path = visible.map((point) => {
      if (point.value === null) { pen = false; return ''; }
      const command = pen ? 'L' : 'M'; pen = true;
      return `${command}${x(point.t).toFixed(1)},${y(point.value).toFixed(1)}`;
    }).join(' ');
    chart.innerHTML = `<title>Rolling simulated seconds per job over time. Lower is better. Y-axis fits the visible samples.</title>
      ${(values.length ? [low, (low + high) / 2, high] : []).map((value) => `<path d="M46 ${y(value)}H776" stroke="#e8eeea"/><text x="35" y="${y(value) + 4}" text-anchor="end">${value.toFixed(1)}s</text>`).join('')}
      ${markers.filter((marker) => marker.t >= start).slice(-5).map((marker, i) => `<path d="M${x(marker.t)} 32V120" stroke="#b5c7bd" stroke-dasharray="3 5"/><text x="${Math.min(665, x(marker.t) + 5)}" y="${14 + i % 2 * 13}">${marker.label}</text>`).join('')}
      <path d="${path}" fill="none" stroke="#175cd3" stroke-width="2.5" stroke-linejoin="round"/>
      <text x="46" y="144">${Math.round(start)}s</text><text x="776" y="144" text-anchor="end">${Math.round(end)}s elapsed</text>`;
  }
  worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
    if (data.kind === 'sample') {
      if (data.revision !== simulation.revision) return;
      const sample = data.sample;
      average.textContent = sample ? `${sample.average.toFixed(1)} s` : '—';
      detail.textContent = sample ? `${sample.jobs} jobs in rolling average` : 'No demand · Increase a slider';
      points.push({ t: now(), value: sample?.average ?? null });
      if (points.length > 600) points.shift();
      while (markers.length > 30) markers.shift();
      draw();
    } else if (data.kind === 'optimized') {
      try {
        if (data.revision !== simulation.revision) throw new Error('The layout changed during optimization. Please try again.');
        const moved = data.placement.filter((slot, i) => slot !== simulation.placement[i]).length;
        const before = [...simulation.placement];
        simulation.applyPlacement(data.placement);
        publish('Placement optimized'); hooks.changed(true);
        hooks.solved(data.trace, before, data.placement);
        status.textContent = moved ? `Placement updated · ${moved} pallets moved` : 'Already as efficient as the solution found.';
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      finally { setBusy(false); }
    } else {
      status.textContent = data.message;
      if (data.operation === 'optimize') setBusy(false);
    }
  };
  worker.onerror = () => {
    failed = true; setBusy(false);
    status.textContent = 'The background simulation could not start. Reload to try again.';
  };
  const visibility = () => send({ kind: 'visibility', active: !document.hidden });
  document.addEventListener('visibilitychange', visibility);
  publish(); visibility(); draw();
  return { publish, get busy() { return busy; }, dispose() { worker.terminate(); document.removeEventListener('visibilitychange', visibility); } };
}
