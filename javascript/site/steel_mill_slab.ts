import { PROBLEMS, buildProblem, buildModel, type SolverMethod, type ProblemData, type ModelMetadata } from './models/steel_mill_slab.js';
import { CpSat, type CpSatModelInstance } from 'or-tools-wasm/cp-sat';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { ActiveSolve, formatJson, requiredElement } from './site_support.js';
import { getMaxWorkerCount } from './worker_limits.js';

const statusEl = requiredElement('status', 'pre');
const summaryEl = requiredElement('summary', 'div');
const slabTable = requiredElement('slab-table', 'table');
const slabDrawing = requiredElement('slab-drawing', 'svg');
const orderDrawing = requiredElement('order-drawing', 'div');
const solverSelect = requiredElement('solver-method', 'select');
const problemSelect = requiredElement('problem-id', 'select');
const breakSymCheckbox = requiredElement('break-symmetries', 'input');
const workersInput = requiredElement('workers', 'input');
const runButton = requiredElement('run', 'button');
const stopButton = requiredElement('stop', 'button');
const activeSolve = new ActiveSolve('Steel mill solve');
const executorSelector = requiredElement('cp-sat-executor', 'select');
const maxWorkerCount = getMaxWorkerCount();

const appendStatus = (text: string) => {
  statusEl.textContent += `${text}\n`;
};

const resetStatus = () => {
  statusEl.textContent = '';
};

const selectedExecutor = configureSolverExecutorSelector(executorSelector);

workersInput.max = String(maxWorkerCount);
workersInput.min = '1';
workersInput.value = String(maxWorkerCount);

const createProblemSelector = () => {
  PROBLEMS.forEach((problem) => {
    const option = document.createElement('option');
    option.value = String(problem.id);
    option.textContent = `Problem ${problem.id} (${problem.numSlabs} slabs, ${problem.orders.length} orders)`;
    problemSelect.appendChild(option);
  });
  problemSelect.value = '3';
};

createProblemSelector();

type SlabRow = {
  slabLabel: string;
  orders: string;
  load: number;
  loss: number;
  colors: string;
};

type DrawOrder = {
  id: number;
  width: number;
  color: number;
};

const orderColor = (color: number) => {
  const hue = (color * 137.508) % 360;
  return `hsl(${hue.toFixed(1)} 68% 42%)`;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const parseDrawOrders = (orders: string): DrawOrder[] => {
  const parsed: DrawOrder[] = [];
  const pattern = /#(\d+)\s+\(w(\d+),\s+c(\d+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(orders)) !== null) {
    parsed.push({
      id: Number(match[1]),
      width: Number(match[2]),
      color: Number(match[3]),
    });
  }
  return parsed;
};

const clearOrderHover = () => {
  slabDrawing.classList.remove('has-hover');
  orderDrawing.querySelector('.order-grid')?.classList.remove('has-hover');
  document.querySelectorAll('[data-order-id].is-hovered').forEach((el) => {
    el.classList.remove('is-hovered');
  });
};

const setOrderHover = (orderId: number | null) => {
  clearOrderHover();
  if (orderId === null) return;
  slabDrawing.classList.add('has-hover');
  orderDrawing.querySelector('.order-grid')?.classList.add('has-hover');
  document.querySelectorAll(`[data-order-id="${orderId}"]`).forEach((el) => {
    el.classList.add('is-hovered');
  });
};

const bindOrderHover = (element: Element | null) => {
  if (!element) return;
  element.querySelectorAll('[data-order-id]').forEach((target) => {
    target.addEventListener('mouseenter', () => {
      setOrderHover(Number(target.getAttribute('data-order-id')));
    });
    target.addEventListener('mouseleave', () => {
      setOrderHover(null);
    });
  });
};

const renderSlabDrawing = (rows: SlabRow[]) => {
  const visibleRows = rows.filter((row) => row.load > 0);
  if (visibleRows.length === 0) {
    slabDrawing.classList.add('hidden');
    slabDrawing.innerHTML = '';
    return;
  }

  const drawingWidth = 980;
  const left = 110;
  const top = 42;
  const slabWidth = 720;
  const slabHeight = 28;
  const depthX = 24;
  const depthY = 14;
  const rowGap = 74;
  const maxCapacity = Math.max(...visibleRows.map((row) => row.load + row.loss), 1);
  const height = top + visibleRows.length * rowGap + 26;
  const defs = `
    <defs>
      <pattern id="waste-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#f6f8fa"></rect>
        <line x1="0" y1="0" x2="0" y2="8" stroke="#8c959f" stroke-width="2"></line>
      </pattern>
      <filter id="slab-shadow" x="-10%" y="-20%" width="130%" height="150%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#57606a" flood-opacity="0.25"></feDropShadow>
      </filter>
    </defs>
  `;
  const body = visibleRows.map((row, rowIndex) => {
    const y = top + rowIndex * rowGap;
    const capacity = Math.max(row.load + row.loss, 1);
    const scale = slabWidth / maxCapacity;
    let x = left;
    const orders = parseDrawOrders(row.orders);
    const orderRects = orders.map((order) => {
      const width = Math.max(2, order.width * scale);
      const fill = orderColor(order.color);
      const label = width > 26 ? `#${order.id}` : '';
      const rect = `
        <g class="order-segment" data-order-id="${order.id}">
          <title>Order #${order.id}: width ${order.width}, color ${order.color}</title>
          <polygon points="${x},${y} ${x + depthX},${y - depthY} ${x + width + depthX},${y - depthY} ${x + width},${y}" fill="${fill}" opacity="0.72" stroke="#24292f" stroke-opacity="0.14"></polygon>
          <rect x="${x}" y="${y}" width="${width}" height="${slabHeight}" fill="${fill}" stroke="#24292f" stroke-opacity="0.22"></rect>
          <text x="${x + width / 2}" y="${y + 18}" text-anchor="middle" font-size="11" fill="#fff" font-weight="700">${label}</text>
        </g>
      `;
      x += width;
      return rect;
    }).join('');
    const loadWidth = row.load * scale;
    const capacityWidth = capacity * scale;
    const wasteWidth = Math.max(0, row.loss * scale);
    const waste = wasteWidth > 0 ? `
      <g>
        <title>Waste/loss ${row.loss}</title>
        <polygon points="${left + loadWidth},${y} ${left + loadWidth + depthX},${y - depthY} ${left + capacityWidth + depthX},${y - depthY} ${left + capacityWidth},${y}" fill="#d0d7de" opacity="0.7" stroke="#8c959f"></polygon>
        <rect x="${left + loadWidth}" y="${y}" width="${wasteWidth}" height="${slabHeight}" fill="url(#waste-hatch)" stroke="#8c959f"></rect>
      </g>
    ` : '';
    return `
      <g filter="url(#slab-shadow)">
        <text x="16" y="${y + 18}" font-size="13" fill="#24292f" font-weight="700">${escapeXml(row.slabLabel)}</text>
        <polygon points="${left},${y} ${left + depthX},${y - depthY} ${left + capacityWidth + depthX},${y - depthY} ${left + capacityWidth},${y}" fill="#eaeef2" stroke="#8c959f"></polygon>
        <polygon points="${left + capacityWidth},${y} ${left + capacityWidth + depthX},${y - depthY} ${left + capacityWidth + depthX},${y + slabHeight - depthY} ${left + capacityWidth},${y + slabHeight}" fill="#d0d7de" stroke="#8c959f"></polygon>
        <rect x="${left}" y="${y}" width="${capacityWidth}" height="${slabHeight}" fill="#fff" stroke="#57606a" stroke-width="1.5"></rect>
        ${orderRects}
        ${waste}
        <rect x="${left}" y="${y}" width="${capacityWidth}" height="${slabHeight}" fill="none" stroke="#24292f" stroke-width="1.5"></rect>
        <text x="${left}" y="${y + slabHeight + 20}" font-size="12" fill="#57606a">load ${row.load} / size ${capacity}, loss ${row.loss}, color groups ${escapeXml(row.colors)}</text>
      </g>
    `;
  }).join('');

  slabDrawing.setAttribute('viewBox', `0 0 ${drawingWidth} ${height}`);
  slabDrawing.setAttribute('width', String(drawingWidth));
  slabDrawing.setAttribute('height', String(height));
  slabDrawing.classList.remove('hidden');
  slabDrawing.innerHTML = `${defs}${body}`;
  bindOrderHover(slabDrawing);
};

const renderOrderDrawing = (problem: ProblemData, rows: SlabRow[]) => {
  const maxWidth = Math.max(...problem.orders.map((order) => order.width), 1);
  const assignmentByOrder = new Map<number, string>();
  rows.forEach((row) => {
    parseDrawOrders(row.orders).forEach((order) => {
      assignmentByOrder.set(order.id, row.slabLabel);
    });
  });
  const cards = problem.orders.map((order, orderId) => {
    const fill = orderColor(order.color);
    const barWidth = Math.max(8, (order.width / maxWidth) * 100);
    const assignedTo = assignmentByOrder.get(orderId) ?? 'unassigned';
    return `
      <div class="order-card" data-order-id="${orderId}" style="--order-color: ${fill}">
        <strong>#${orderId}</strong>
        <small><span class="order-swatch"></span>color group ${order.color}</small>
        <small>width ${order.width}</small>
        <small>${escapeXml(assignedTo)}</small>
        <div class="order-width" style="width: ${barWidth}%"></div>
      </div>
    `;
  }).join('');
  orderDrawing.innerHTML = `<div class="order-grid">${cards}</div>`;
  orderDrawing.classList.remove('hidden');
  bindOrderHover(orderDrawing);
};

const renderTable = (rows: SlabRow[]) => {
  slabTable.innerHTML = '';
  const header = document.createElement('thead');
  header.innerHTML = `<tr>
    <th>Slab</th>
    <th>Orders</th>
    <th>Load</th>
    <th>Loss</th>
    <th>Colors</th>
  </tr>`;
  slabTable.appendChild(header);
  const body = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.slabLabel}</td>
      <td>${row.orders}</td>
      <td>${row.load}</td>
      <td>${row.loss}</td>
      <td>${row.colors}</td>`;
    body.appendChild(tr);
  });
  slabTable.appendChild(body);
};

const parseSolution = (response: unknown): number[] | null => {
  if (!response || typeof response !== 'object') return null;
  const candidate = (response as Record<string, unknown>).solution;
  if (!Array.isArray(candidate)) return null;
  return candidate.map((value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return Number(value ?? 0);
  });
};

const buildAssignmentRows = (solution: number[], metadata: ModelMetadata): SlabRow[] => {
  const numSlabs = metadata.problem.numSlabs;
  const orders = metadata.problem.orders;
  const assignByOrder = metadata.assignByOrder!;
  const loadIndices = metadata.loadIndices!;
  const lossIndices = metadata.lossIndices!;
  const colorIndices = metadata.colorIndices!;

  const rows: SlabRow[] = [];
  for (let slabId = 0; slabId < numSlabs; ++slabId) {
    const assignedOrders: string[] = [];

    for (let orderId = 0; orderId < orders.length; ++orderId) {
      const varIdx = assignByOrder[orderId][slabId];
      if (solution[varIdx] === 1) {
        const order = orders[orderId];
        assignedOrders.push(`#${orderId} (w${order.width}, c${order.color})`);
      }
    }
    if (!assignedOrders.length) continue;
    const colorSet = colorIndices[slabId]
      .map((varIdx, colorIdx) => (solution[varIdx] === 1 ? colorIdx + 1 : -1))
      .filter((c) => c >= 0);
    const load = solution[loadIndices[slabId]] ?? 0;
    const loss = solution[lossIndices[slabId]] ?? 0;
    rows.push({
      slabLabel: `Slab ${slabId}`,
      orders: assignedOrders.join(', ') || '—',
      load,
      loss,
      colors: colorSet.join(', ') || '—',
    });
  }
  return rows;
};

const buildColumnRows = (solution: number[], metadata: ModelMetadata): SlabRow[] => {
  const columns = metadata.validSlabs ?? [];
  const selectedIndices = metadata.selectedIndices ?? [];
  const orders = metadata.problem.orders;
  const selectedColumns = selectedIndices
    .map((varIdx, columnId) => (solution[varIdx] === 1 ? columnId : -1))
    .filter((columnId) => columnId >= 0);

  return selectedColumns.map((columnId, idx) => {
    const column = columns[columnId];
    const assignedOrders = column.assignment
      .map((value, orderId) =>
        value === 1 ? `#${orderId} (w${orders[orderId].width}, c${orders[orderId].color})` : null,
      )
      .filter((entry): entry is string => Boolean(entry));
    const colorSet = column.assignment
      .map((value, orderId) => (value === 1 ? orders[orderId].color : -1))
      .filter((color) => color >= 0);
    return {
      slabLabel: `Column ${idx}`,
      orders: assignedOrders.join(', ') || '—',
      load: column.load,
      loss: column.loss,
      colors: Array.from(new Set(colorSet)).join(', ') || '—',
    };
  });
};

const runExperiment = async () => {
  const signal = activeSolve.start();
  runButton.disabled = true;
  stopButton.disabled = false;
  const solverMethod = solverSelect.value as SolverMethod;
  const problemId = Number.parseInt(problemSelect.value, 10);
  const breakSymmetries = breakSymCheckbox.checked;
  const workerCount = Math.min(
    Math.max(1, Number.parseInt(workersInput.value, 10)),
    maxWorkerCount,
  );
  const params: Record<string, unknown> = {
    logSearchProgress: true,
    maxTimeInSeconds: 10,
    numWorkers: workerCount,
  };

  resetStatus();
  summaryEl.textContent = 'Running…';
  slabDrawing.classList.add('hidden');
  slabDrawing.innerHTML = '';
  orderDrawing.classList.add('hidden');
  orderDrawing.innerHTML = '';
  appendStatus(`Building ${solverMethod} model for problem ${problemId}…`);
  const problem = buildProblem(problemId);
  const bundle = buildModel(solverMethod, problem, breakSymmetries);

  try {
    let modelInstance: CpSatModelInstance;
    try {
      modelInstance = await CpSat.createModel(bundle.model as Record<string, unknown>);
    } catch (error) {
      appendStatus(`Model build failed: ${(error as Error).message}`);
      return;
    }

    const validation = await CpSat.validate(modelInstance, { executor: selectedExecutor() });
    if (!validation.ok) {
      appendStatus(`Model invalid: ${validation.message}`);
      return;
    }

    appendStatus('Solving…');
    try {
      const result = await CpSat.solveProto(modelInstance, {
        ...params,
        executor: selectedExecutor(),
        signal,
      });
      const response = result.response;
      if (!response) {
        appendStatus('Solver returned no response.');
        return;
      }
      appendStatus(`Solver response: ${formatJson(response)}`);

      const solution = parseSolution(response);
      if (!solution) {
        appendStatus('No solution data returned.');
        return;
      }

      let rows: SlabRow[] = [];
      if (bundle.metadata.solver === 'sat_column') {
        rows = buildColumnRows(solution, bundle.metadata);
      } else {
        rows = buildAssignmentRows(solution, bundle.metadata);
      }

      renderTable(rows);
      renderSlabDrawing(rows);
      renderOrderDrawing(bundle.metadata.problem, rows);
      const totalLoss = rows.reduce((sum, row) => sum + row.loss, 0);
      summaryEl.textContent =
        `Solver ${bundle.metadata.solver} used ${rows.length} slabs with total loss ${totalLoss}.`;
    } catch (error) {
      const err = error as Error;
      const message = err?.message ?? String(err);
      appendStatus(`Solve failed: ${message}`);
      summaryEl.textContent = `Solve failed: ${message}`;
      if (err?.stack) {
        appendStatus(err.stack);
      }
      // Surface detailed error information (message + stack) in DevTools.
      console.error('[steel_mill_slab] solve failed:', message);
      if (err?.stack) {
        console.error(err.stack);
      }
    }
  } catch (error) {
    const message = `Run failed: ${error instanceof Error ? error.message : String(error)}`;
    appendStatus(message);
    summaryEl.textContent = message;
  } finally {
    activeSolve.finish(signal);
    runButton.disabled = false;
    stopButton.disabled = true;
  }
};

runButton.addEventListener('click', () => void runExperiment());

stopButton.addEventListener('click', () => {
  appendStatus('Cancellation requested.');
  activeSolve.cancel(new Error('Steel mill solve cancelled.'));
});

const updateBreakSymVisibility = () => {
  const isColumn = solverSelect.value === 'sat_column';
  breakSymCheckbox.disabled = isColumn;
};
solverSelect.addEventListener('change', updateBreakSymVisibility);
updateBreakSymVisibility();
