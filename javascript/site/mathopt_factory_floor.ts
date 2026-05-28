import {
  initMathOpt,
  MathOpt,
  setWorkerBridgeEnabled,
  type MathOptIncrementalSolver,
  type MathOptLinearConstraint,
  type MathOptModel,
  type MathOptVariable,
} from 'or-tools-wasm/mathopt';
import { getMaxWorkerCount } from './worker_limits.js';

type Direction = 'up' | 'right' | 'down' | 'left';
type CellKind = 'floor' | 'source' | 'belt' | 'machine' | 'display' | 'storefront';
type ProcessType = 'mix' | 'laminate' | 'proof' | 'bake' | 'decorate' | 'pack';
type SourceType = 'pantry' | 'fridge' | 'sink' | 'packaging';
type ResourceType = 'flour' | 'butter' | 'sugar' | 'eggs' | 'yeast' | 'chocolate' | 'fruit' | 'cream' | 'water' | 'packaging';
type ProductType = 'bread' | 'croissant' | 'chocolate_croissant' | 'fruit_tart' | 'cupcake' | 'cake';
type MaterialType =
  | ResourceType
  | ProductType
  | 'bread_dough'
  | 'proofed_bread_dough'
  | 'baked_loaf'
  | 'croissant_dough'
  | 'laminated_dough'
  | 'proofed_laminated_dough'
  | 'baked_croissant'
  | 'chocolate_laminated_dough'
  | 'proofed_chocolate_dough'
  | 'baked_chocolate_croissant'
  | 'tart_pastry_dough'
  | 'tart_shell'
  | 'filled_tart'
  | 'cupcake_batter'
  | 'baked_cupcake'
  | 'iced_cupcake'
  | 'cake_batter'
  | 'baked_cake'
  | 'decorated_cake';
type TokenPhase = 'waiting' | 'moving_to_machine' | 'loaded' | 'processing' | 'delivering';
type JobStatus = 'collecting' | 'loading' | 'processing' | 'done';
type CustomerState = 'walking' | 'waiting' | 'served';

declare global {
  interface Window {
    __factoryDebug?: () => unknown;
  }
}

type Point = { x: number; y: number };
type FactoryCell = {
  x: number;
  y: number;
  kind: CellKind;
  label: string;
  shortLabel?: string;
  color?: string;
  direction?: Direction;
  inactive?: boolean;
};
type MaterialView = {
  label: string;
  shortLabel: string;
  displayLabel: string;
  color: string;
};
type RecipeStep = {
  process: ProcessType;
  inputs: MaterialType[];
  output: MaterialType;
  minutes: number;
};
type Recipe = {
  resources: Partial<Record<ResourceType, number>>;
  steps: RecipeStep[];
  priority: number;
  color: string;
};
type Source = Point & {
  type: SourceType;
  label: string;
  shortLabel: string;
  materials: ResourceType[];
  color: string;
};
type Machine = Point & {
  id: string;
  process: ProcessType;
  label: string;
  maxIndex: number;
  tokenId: number | null;
};
type Customer = {
  id: number;
  product: ProductType;
  quantity: number;
  fulfilled: number;
  state: CustomerState;
  createdAtMinute: number;
  servedAtMinute?: number;
};
type MaterialToken = {
  id: number;
  jobId: number;
  material: MaterialType;
  x: number;
  y: number;
  phase: TokenPhase;
  route: Point[];
  routeIndex: number;
  plannedRouteIndexLimit: number;
  process: ProcessType;
  stepIndex: number;
  machineId: string | null;
  remainingMinutes: number;
};
type Job = {
  id: number;
  product: ProductType;
  scheduledStartMinute: number;
  stepIndex: number;
  currentMaterial: MaterialType | null;
  currentTokenId: number | null;
  inputTokenIds: number[];
  loadingMachineId: string | null;
  stepSchedule: PlannedStep[];
  inputReleases: ScheduledInputRelease[];
  status: JobStatus;
};
type PlannedStep = {
  stepIndex: number;
  startMinute: number;
  machineId: string;
};
type ScheduledInputRelease = {
  id: number;
  stepIndex: number;
  input: ResourceType;
  machineId: string;
  released: boolean;
  tokenId: number | null;
  plannedDispatchMinute: number | null;
};
type StartDecision = {
  product: ProductType;
  slot: number;
  count: number;
};
type PlannerModel = {
  model: MathOptModel;
  solver: MathOptIncrementalSolver;
  starts: Record<ProductType, MathOptVariable[]>;
  demandConstraints: Record<ProductType, MathOptLinearConstraint>;
  resourceConstraints: Record<ResourceType, MathOptLinearConstraint>;
  processConstraints: Record<ProcessType, MathOptLinearConstraint[]>;
  totalStartsConstraint: MathOptLinearConstraint;
};
type BakeryPlan = {
  status: string;
  starts: Record<ProductType, number>;
  need: Record<ProductType, number>;
  launched: Record<ProductType, number>;
  bottlenecks: Array<{ label: string; used: number; capacity: number }>;
  objective: number;
  incremental: boolean;
  solveKind: PlanSolveKind;
};
type PlanSolveKind = 'full' | 'partial';
type TrafficReleaseCandidate = {
  job: Job;
  release: ScheduledInputRelease;
  source: Source;
  machine: Machine;
  groupKey: string;
  route: Point[];
  routeWithStart: Point[];
  preferredDispatchTick: number;
  priority: number;
};

const width = 32;
const height = 18;
const maxWaitingCustomers = 10;
const planningHorizonMinutes = 28;
const maxStartsPerPlan = 4;
const maxWip = 18;
const tokenSpeedCellsPerSecond = 4.4;
const openingMinute = 6 * 60;
const realSecondsPerShopMinute = 5;
const servedExitMinutes = 0.45;
const planSlotMinutes = 1;
const planSlotCount = 28;
const prefetchSlotCount = 10;
const factoryPlanDebug = true;
const resourceScale = 10;
const processScale = 10;
const trafficPlanHorizonTicks = 72;
const trafficDispatchSlackTicks = 10;
const trafficCandidateLimit = 36;

const processLabels: Record<ProcessType, string> = {
  mix: 'Mixer',
  laminate: 'Laminator',
  proof: 'Proofer',
  bake: 'Oven',
  decorate: 'Decorator',
  pack: 'Packer',
};

const processColors: Record<ProcessType, string> = {
  mix: '#0969da',
  laminate: '#8250df',
  proof: '#1a7f37',
  bake: '#bf8700',
  decorate: '#cf222e',
  pack: '#0a7f8f',
};

const productLabels: Record<ProductType, string> = {
  bread: 'Bread',
  croissant: 'Croissant',
  chocolate_croissant: 'Chocolate croissant',
  fruit_tart: 'Fruit tart',
  cupcake: 'Cupcake',
  cake: 'Cake',
};

const materialViews: Record<MaterialType, MaterialView> = {
  flour: { label: 'Flour', shortLabel: 'Fl', displayLabel: 'Flour', color: '#f2cc8f' },
  butter: { label: 'Butter', shortLabel: 'Bu', displayLabel: 'Butter', color: '#ffd166' },
  sugar: { label: 'Sugar', shortLabel: 'Su', displayLabel: 'Sugar', color: '#f8f9fa' },
  eggs: { label: 'Eggs', shortLabel: 'Eg', displayLabel: 'Eggs', color: '#f4a261' },
  yeast: { label: 'Yeast', shortLabel: 'Ye', displayLabel: 'Yeast', color: '#8d6e63' },
  chocolate: { label: 'Chocolate', shortLabel: 'Ch', displayLabel: 'Chocolate', color: '#6f4e37' },
  fruit: { label: 'Fruit', shortLabel: 'Fr', displayLabel: 'Fruit', color: '#ef476f' },
  cream: { label: 'Cream', shortLabel: 'Cr', displayLabel: 'Cream', color: '#fff3b0' },
  water: { label: 'Water', shortLabel: 'Wa', displayLabel: 'Water', color: '#58a6ff' },
  packaging: { label: 'Packaging', shortLabel: 'Pk', displayLabel: 'Packaging', color: '#90be6d' },
  bread_dough: { label: 'Bread dough', shortLabel: 'Dg', displayLabel: 'Dough', color: '#d4a373' },
  proofed_bread_dough: { label: 'Proofed dough', shortLabel: 'Pr', displayLabel: 'Proofed dough', color: '#c9a66b' },
  baked_loaf: { label: 'Baked loaf', shortLabel: 'Lf', displayLabel: 'Baked loaf', color: '#bc6c25' },
  bread: { label: 'Bread', shortLabel: 'Br', displayLabel: 'Bread', color: '#c47f36' },
  croissant_dough: { label: 'Croissant dough', shortLabel: 'Dg', displayLabel: 'Dough', color: '#d4a373' },
  laminated_dough: { label: 'Laminated dough', shortLabel: 'Lm', displayLabel: 'Laminated', color: '#e9c46a' },
  proofed_laminated_dough: { label: 'Proofed laminated dough', shortLabel: 'Pr', displayLabel: 'Proofed dough', color: '#dfb84d' },
  baked_croissant: { label: 'Baked croissant', shortLabel: 'Cr', displayLabel: 'Baked croissant', color: '#e0a735' },
  croissant: { label: 'Croissant', shortLabel: 'Cr', displayLabel: 'Croissant', color: '#e9b44c' },
  chocolate_laminated_dough: { label: 'Chocolate laminated dough', shortLabel: 'Lm', displayLabel: 'Laminated', color: '#b08968' },
  proofed_chocolate_dough: { label: 'Proofed chocolate dough', shortLabel: 'Pr', displayLabel: 'Proofed dough', color: '#9c6644' },
  baked_chocolate_croissant: { label: 'Baked chocolate croissant', shortLabel: 'Ch', displayLabel: 'Baked chocolate', color: '#7f5539' },
  chocolate_croissant: { label: 'Chocolate croissant', shortLabel: 'Ch', displayLabel: 'Chocolate croissant', color: '#8b5e34' },
  tart_pastry_dough: { label: 'Tart pastry dough', shortLabel: 'Pa', displayLabel: 'Pastry dough', color: '#e9c46a' },
  tart_shell: { label: 'Tart shell', shortLabel: 'Sh', displayLabel: 'Tart shell', color: '#d08c60' },
  filled_tart: { label: 'Filled tart', shortLabel: 'Ft', displayLabel: 'Filled tart', color: '#ef476f' },
  fruit_tart: { label: 'Fruit tart', shortLabel: 'Ta', displayLabel: 'Fruit tart', color: '#e76f51' },
  cupcake_batter: { label: 'Cupcake batter', shortLabel: 'Ba', displayLabel: 'Batter', color: '#f6bd60' },
  baked_cupcake: { label: 'Baked cupcake', shortLabel: 'Cp', displayLabel: 'Baked cupcake', color: '#d4a373' },
  iced_cupcake: { label: 'Iced cupcake', shortLabel: 'Ic', displayLabel: 'Iced cupcake', color: '#f4a6c1' },
  cupcake: { label: 'Cupcake', shortLabel: 'Cp', displayLabel: 'Cupcake', color: '#f4a6c1' },
  cake_batter: { label: 'Cake batter', shortLabel: 'Ba', displayLabel: 'Batter', color: '#f6bd60' },
  baked_cake: { label: 'Baked cake', shortLabel: 'Ck', displayLabel: 'Baked cake', color: '#bc6c25' },
  decorated_cake: { label: 'Decorated cake', shortLabel: 'Dc', displayLabel: 'Decorated cake', color: '#b56576' },
  cake: { label: 'Cake', shortLabel: 'Ca', displayLabel: 'Cake', color: '#b56576' },
};

const processingViews: Record<ProcessType, MaterialView> = {
  mix: { label: 'Mixing', shortLabel: 'Mix', displayLabel: 'Mixing', color: processColors.mix },
  laminate: { label: 'Laminating dough', shortLabel: 'Lam', displayLabel: 'Laminating', color: processColors.laminate },
  proof: { label: 'Proofing dough', shortLabel: 'Pr', displayLabel: 'Proofing', color: processColors.proof },
  bake: { label: 'Baking', shortLabel: 'Bak', displayLabel: 'Baking', color: processColors.bake },
  decorate: { label: 'Decorating', shortLabel: 'Dec', displayLabel: 'Decorating', color: processColors.decorate },
  pack: { label: 'Packing', shortLabel: 'Pkg', displayLabel: 'Packing', color: processColors.pack },
};

const sourceDefinitions: Record<SourceType, Source> = {
  pantry: {
    type: 'pantry',
    x: 0,
    y: 2,
    label: 'Pantry',
    shortLabel: 'Pan',
    materials: ['flour', 'sugar', 'yeast', 'chocolate'],
    color: '#b54708',
  },
  fridge: {
    type: 'fridge',
    x: 0,
    y: 4,
    label: 'Fridge',
    shortLabel: 'Frg',
    materials: ['butter', 'eggs', 'cream', 'fruit'],
    color: '#0969da',
  },
  sink: {
    type: 'sink',
    x: 0,
    y: 6,
    label: 'Sink',
    shortLabel: 'H2O',
    materials: ['water'],
    color: '#0a7f8f',
  },
  packaging: {
    type: 'packaging',
    x: 0,
    y: 8,
    label: 'Packaging shelf',
    shortLabel: 'Box',
    materials: ['packaging'],
    color: '#1a7f37',
  },
};

const sourceForResource = Object.fromEntries(
  Object.values(sourceDefinitions).flatMap((source) => source.materials.map((material) => [material, source.type])),
) as Record<ResourceType, SourceType>;

const recipes: Record<ProductType, Recipe> = {
  bread: {
    resources: { flour: 2.2, water: 1, yeast: 0.5, packaging: 0.2 },
    steps: [
      { process: 'mix', inputs: ['flour', 'water', 'yeast'], output: 'bread_dough', minutes: 1.2 },
      { process: 'proof', inputs: ['bread_dough'], output: 'proofed_bread_dough', minutes: 6 },
      { process: 'bake', inputs: ['proofed_bread_dough'], output: 'baked_loaf', minutes: 2.4 },
      { process: 'pack', inputs: ['baked_loaf', 'packaging'], output: 'bread', minutes: 0.6 },
    ],
    priority: 15,
    color: materialViews.bread.color,
  },
  croissant: {
    resources: { flour: 1.1, water: 0.6, butter: 1.4, sugar: 0.25, yeast: 0.25, packaging: 0.25 },
    steps: [
      { process: 'mix', inputs: ['flour', 'water', 'yeast', 'sugar'], output: 'croissant_dough', minutes: 1.2 },
      { process: 'laminate', inputs: ['croissant_dough', 'butter'], output: 'laminated_dough', minutes: 3 },
      { process: 'proof', inputs: ['laminated_dough'], output: 'proofed_laminated_dough', minutes: 4.8 },
      { process: 'bake', inputs: ['proofed_laminated_dough'], output: 'baked_croissant', minutes: 2.4 },
      { process: 'pack', inputs: ['baked_croissant', 'packaging'], output: 'croissant', minutes: 0.6 },
    ],
    priority: 23,
    color: materialViews.croissant.color,
  },
  chocolate_croissant: {
    resources: { flour: 1.1, water: 0.6, butter: 1.35, sugar: 0.3, yeast: 0.25, chocolate: 0.7, packaging: 0.25 },
    steps: [
      { process: 'mix', inputs: ['flour', 'water', 'yeast', 'sugar'], output: 'croissant_dough', minutes: 1.2 },
      { process: 'laminate', inputs: ['croissant_dough', 'butter', 'chocolate'], output: 'chocolate_laminated_dough', minutes: 3.6 },
      { process: 'proof', inputs: ['chocolate_laminated_dough'], output: 'proofed_chocolate_dough', minutes: 4.8 },
      { process: 'bake', inputs: ['proofed_chocolate_dough'], output: 'baked_chocolate_croissant', minutes: 2.4 },
      { process: 'pack', inputs: ['baked_chocolate_croissant', 'packaging'], output: 'chocolate_croissant', minutes: 0.6 },
    ],
    priority: 30,
    color: materialViews.chocolate_croissant.color,
  },
  fruit_tart: {
    resources: { flour: 0.9, butter: 0.8, sugar: 0.45, fruit: 1.1, cream: 0.5, packaging: 0.35 },
    steps: [
      { process: 'mix', inputs: ['flour', 'butter', 'sugar'], output: 'tart_pastry_dough', minutes: 1.2 },
      { process: 'bake', inputs: ['tart_pastry_dough'], output: 'tart_shell', minutes: 1.8 },
      { process: 'decorate', inputs: ['tart_shell', 'fruit', 'cream'], output: 'filled_tart', minutes: 2.4 },
      { process: 'pack', inputs: ['filled_tart', 'packaging'], output: 'fruit_tart', minutes: 0.6 },
    ],
    priority: 34,
    color: materialViews.fruit_tart.color,
  },
  cupcake: {
    resources: { flour: 0.8, sugar: 0.55, eggs: 0.7, cream: 0.35, packaging: 0.25 },
    steps: [
      { process: 'mix', inputs: ['flour', 'sugar', 'eggs'], output: 'cupcake_batter', minutes: 1.2 },
      { process: 'bake', inputs: ['cupcake_batter'], output: 'baked_cupcake', minutes: 1.8 },
      { process: 'decorate', inputs: ['baked_cupcake', 'cream'], output: 'iced_cupcake', minutes: 1.8 },
      { process: 'pack', inputs: ['iced_cupcake', 'packaging'], output: 'cupcake', minutes: 0.6 },
    ],
    priority: 20,
    color: materialViews.cupcake.color,
  },
  cake: {
    resources: { flour: 1.3, butter: 0.8, sugar: 1.1, eggs: 1.2, cream: 1.0, fruit: 0.35, packaging: 0.6 },
    steps: [
      { process: 'mix', inputs: ['flour', 'sugar', 'eggs', 'butter'], output: 'cake_batter', minutes: 1.8 },
      { process: 'bake', inputs: ['cake_batter'], output: 'baked_cake', minutes: 3 },
      { process: 'decorate', inputs: ['baked_cake', 'cream', 'fruit'], output: 'decorated_cake', minutes: 3 },
      { process: 'pack', inputs: ['decorated_cake', 'packaging'], output: 'cake', minutes: 1.2 },
    ],
    priority: 42,
    color: materialViews.cake.color,
  },
};

const productTypes = Object.keys(recipes) as ProductType[];
const processTypes = Object.keys(processLabels) as ProcessType[];
const sourceTypes = Object.keys(sourceDefinitions) as SourceType[];
const resourceTypes = Object.keys(sourceForResource) as ResourceType[];

const initialIngredients: Record<ResourceType, number> = {
  flour: 70,
  butter: 30,
  sugar: 34,
  eggs: 28,
  yeast: 14,
  chocolate: 14,
  fruit: 18,
  cream: 22,
  water: 80,
  packaging: 38,
};

const processorCounts: Record<ProcessType, number> = {
  mix: 3,
  laminate: 3,
  proof: 3,
  bake: 3,
  decorate: 3,
  pack: 3,
};

const shelfTargets: Record<ProductType, number> = {
  bread: 2,
  croissant: 2,
  chocolate_croissant: 1,
  fruit_tart: 1,
  cupcake: 2,
  cake: 1,
};

const sourceOutstandingLimits: Record<SourceType, number> = {
  pantry: 5,
  fridge: 4,
  sink: 1,
  packaging: 2,
};

const machineLayout: Machine[] = [
  { id: 'mix-1', process: 'mix', x: 6, y: 5, label: 'Mixer 1', maxIndex: 0, tokenId: null },
  { id: 'mix-2', process: 'mix', x: 8, y: 13, label: 'Mixer 2', maxIndex: 1, tokenId: null },
  { id: 'mix-3', process: 'mix', x: 4, y: 7, label: 'Mixer 3', maxIndex: 2, tokenId: null },
  { id: 'laminate-1', process: 'laminate', x: 12, y: 5, label: 'Laminator 1', maxIndex: 0, tokenId: null },
  { id: 'laminate-2', process: 'laminate', x: 12, y: 13, label: 'Laminator 2', maxIndex: 1, tokenId: null },
  { id: 'laminate-3', process: 'laminate', x: 10, y: 7, label: 'Laminator 3', maxIndex: 2, tokenId: null },
  { id: 'proof-1', process: 'proof', x: 16, y: 5, label: 'Proofer 1', maxIndex: 0, tokenId: null },
  { id: 'proof-2', process: 'proof', x: 16, y: 13, label: 'Proofer 2', maxIndex: 1, tokenId: null },
  { id: 'proof-3', process: 'proof', x: 15, y: 7, label: 'Proofer 3', maxIndex: 2, tokenId: null },
  { id: 'bake-1', process: 'bake', x: 21, y: 5, label: 'Oven 1', maxIndex: 0, tokenId: null },
  { id: 'bake-2', process: 'bake', x: 21, y: 13, label: 'Oven 2', maxIndex: 1, tokenId: null },
  { id: 'bake-3', process: 'bake', x: 19, y: 7, label: 'Oven 3', maxIndex: 2, tokenId: null },
  { id: 'decorate-1', process: 'decorate', x: 25, y: 5, label: 'Decorator 1', maxIndex: 0, tokenId: null },
  { id: 'decorate-2', process: 'decorate', x: 23, y: 13, label: 'Decorator 2', maxIndex: 1, tokenId: null },
  { id: 'decorate-3', process: 'decorate', x: 24, y: 7, label: 'Decorator 3', maxIndex: 2, tokenId: null },
  { id: 'pack-1', process: 'pack', x: 29, y: 5, label: 'Packer 1', maxIndex: 0, tokenId: null },
  { id: 'pack-2', process: 'pack', x: 28, y: 13, label: 'Packer 2', maxIndex: 1, tokenId: null },
  { id: 'pack-3', process: 'pack', x: 27, y: 7, label: 'Packer 3', maxIndex: 2, tokenId: null },
];

const displayPoint: Point = { x: 30, y: 15 };

const boardEl = document.getElementById('factory-board');
const entityLayerEl = document.getElementById('entity-layer');
const clockEl = document.getElementById('shop-clock');
const metricsEl = document.getElementById('metrics');
const factoryPlanningStatusEl = document.getElementById('factory-planning-status');
const storefrontEl = document.getElementById('storefront');
const orderPanelEl = document.getElementById('order-panel');
const toggleRunningButton = document.getElementById('toggle-running') as HTMLButtonElement | null;
const resetFloorButton = document.getElementById('reset-floor') as HTMLButtonElement | null;
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const workerThreadsInput = document.getElementById('worker-threads') as HTMLInputElement | null;

let running = false;
let initialized = false;
let solving = false;
let pendingPlanRequest = false;
let activeSolveKind: PlanSolveKind | null = null;
let customerId = 1;
let jobId = 1;
let tokenId = 1;
let releaseId = 1;
let shopMinute = openingMinute;
let nextOrderAtMinute = openingMinute;
let nextPlanAtMinute = Number.POSITIVE_INFINITY;
let lastPlanMinute = Number.NEGATIVE_INFINITY;
let animationFrame: number | null = null;
let lastFrameTime = 0;
let renderedBoardRunning: boolean | null = null;
let customers: Customer[] = [];
let jobs: Job[] = [];
let tokens: MaterialToken[] = [];
let finishedStock = zeroProductRecord();
let totalDelivered = 0;
let ingredientStock: Record<ResourceType, number> = { ...initialIngredients };
let cells = buildCells();
let planner: PlannerModel | null = null;
let plan: BakeryPlan | null = null;
let lastError = '';
let movementPlanStatus = 'Idle';

const maxWorkerCount = getMaxWorkerCount();
if (workerThreadsInput) {
  const initialThreads = Math.min(4, maxWorkerCount);
  workerThreadsInput.max = String(maxWorkerCount);
  workerThreadsInput.value = String(initialThreads);
  workerThreadsInput.title = `Available worker threads: ${maxWorkerCount}`;
}
if (workerBridgeToggle) {
  workerBridgeToggle.checked = true;
  setWorkerBridgeEnabled(true);
}

function zeroProductRecord(): Record<ProductType, number> {
  return Object.fromEntries(productTypes.map((product) => [product, 0])) as Record<ProductType, number>;
}

function formatNumber(value: number): string {
  if (Math.abs(value) < 0.05) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function debugFactoryPlan(message: string, data?: unknown): void {
  if (!factoryPlanDebug) return;
  if (data === undefined) {
    console.debug(`[factory-plan] ${message}`);
  } else {
    console.debug(`[factory-plan] ${message} ${JSON.stringify(data)}`);
  }
}

const debugFactoryPlanState = new Map<string, string>();
function debugFactoryPlanOnChange(key: string, message: string, data: unknown): void {
  if (!factoryPlanDebug) return;
  const signature = JSON.stringify(data);
  if (debugFactoryPlanState.get(key) === signature) return;
  debugFactoryPlanState.set(key, signature);
  debugFactoryPlan(message, data);
}

function formatClock(minute: number): string {
  const total = Math.floor(minute);
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatWait(minutes: number): string {
  return `${Math.max(0, Math.floor(minutes))}m waiting`;
}

function buildCells(): FactoryCell[] {
  const next: FactoryCell[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      next.push({ x, y, kind: 'floor', label: 'Floor' });
    }
  }
  const set = (cell: FactoryCell) => {
    next[cell.y * width + cell.x] = cell;
  };
  const belt = (x: number, y: number, direction: Direction, label = 'Conveyor') => {
    set({ x, y, kind: 'belt', label, direction });
  };
  const horizontal = (x1: number, x2: number, y: number, direction: Direction) => {
    const start = Math.min(x1, x2);
    const end = Math.max(x1, x2);
    for (let x = start; x <= end; x += 1) belt(x, y, direction);
  };
  const vertical = (x: number, y1: number, y2: number, direction: Direction) => {
    const start = Math.min(y1, y2);
    const end = Math.max(y1, y2);
    for (let y = start; y <= end; y += 1) belt(x, y, direction);
  };

  vertical(2, 2, 15, 'down');
  vertical(5, 4, 15, 'down');
  vertical(13, 4, 15, 'down');
  vertical(20, 4, 15, 'down');
  vertical(28, 4, 15, 'down');
  vertical(30, 4, 15, 'down');
  horizontal(2, 30, 4, 'right');
  horizontal(2, 30, 6, 'right');
  horizontal(2, 30, 8, 'right');
  horizontal(2, 30, 12, 'right');
  horizontal(2, 30, 15, 'right');

  for (const source of Object.values(sourceDefinitions)) {
    set({ ...source, kind: 'source' });
    if (source.x === 0) belt(1, source.y, 'right', 'Source feeder');
    if (source.x === width - 1) belt(width - 2, source.y, 'left', 'Source feeder');
  }

  for (const machine of machineLayout) {
    set({
      x: machine.x,
      y: machine.y,
      kind: 'machine',
      label: machine.label,
      shortLabel: processLabels[machine.process].slice(0, 1),
      color: processColors[machine.process],
      inactive: !isMachineActive(machine),
    });
  }
  set({ x: displayPoint.x, y: displayPoint.y, kind: 'display', label: 'Display shelf', shortLabel: 'D' });
  for (const y of [6, 7, 8, 9, 10]) set({ x: 31, y, kind: 'storefront', label: 'Storefront handoff', shortLabel: '$' });

  return next;
}

function isMachineActive(machine: Machine): boolean {
  return machine.maxIndex < processorCounts[machine.process];
}

function activeMachinesForProcess(process: ProcessType): Machine[] {
  return machineLayout.filter((machine) => machine.process === process && isMachineActive(machine));
}

function plannedMachineForStep(product: ProductType, stepIndex: number, sequence: number, schedule: PlannedStep[]): Machine | null {
  const step = recipes[product].steps[stepIndex];
  const machines = activeMachinesForProcess(step.process)
    .filter((machine) => canRouteStepToMachine(product, stepIndex, machine, schedule));
  machines.sort((left, right) => (
      reservedLoadForMachine(left, shopMinute, shopMinute + planningHorizonMinutes)
        - reservedLoadForMachine(right, shopMinute, shopMinute + planningHorizonMinutes)
        || ((sequence + stepIndex + left.maxIndex) % machines.length)
        - ((sequence + stepIndex + right.maxIndex) % machines.length)
  ));
  return machines[0] ?? null;
}

function canRouteStepToMachine(product: ProductType, stepIndex: number, machine: Machine, schedule: PlannedStep[]): boolean {
  const step = recipes[product].steps[stepIndex];
  for (const input of step.inputs) {
    if (!isResource(input)) continue;
    const source = sourceDefinitions[sourceForResource[input]];
    if (!routeBetween(source, machine)) return false;
  }
  if (stepIndex > 0) {
    const previousMachineId = schedule[stepIndex - 1]?.machineId;
    const previousMachine = machineLayout.find((candidate) => candidate.id === previousMachineId);
    if (!previousMachine || !routeBetween(previousMachine, machine)) return false;
  }
  if (stepIndex === recipes[product].steps.length - 1 && !routeBetween(machine, displayPoint)) return false;
  return true;
}

function reservedLoadForMachine(machine: Machine, windowStart: number, windowEnd: number): number {
  let load = 0;
  const processingToken = machine.tokenId === null ? null : tokens.find((token) => token.id === machine.tokenId);
  if (processingToken?.phase === 'processing') {
    load += absoluteIntervalOverlap(shopMinute, shopMinute + processingToken.remainingMinutes, windowStart, windowEnd);
  }
  for (const job of jobs) {
    if (job.status === 'done') continue;
    for (let stepIndex = job.stepIndex; stepIndex < recipes[job.product].steps.length; stepIndex += 1) {
      const scheduled = job.stepSchedule[stepIndex];
      if (!scheduled || scheduled.machineId !== machine.id) continue;
      if (job.status === 'processing' && stepIndex === job.stepIndex) continue;
      const step = recipes[job.product].steps[stepIndex];
      load += absoluteIntervalOverlap(scheduled.startMinute, scheduled.startMinute + step.minutes, windowStart, windowEnd);
    }
  }
  return load;
}

function absoluteIntervalOverlap(start: number, end: number, windowStart: number, windowEnd: number): number {
  return Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart));
}

function travelMinutesBetween(from: Point, to: Point): number | null {
  const route = routeBetween(from, to);
  if (!route) return null;
  return route.length / (tokenSpeedCellsPerSecond * realSecondsPerShopMinute);
}

function activeCustomers(): Customer[] {
  return customers.filter((customer) => customer.state !== 'served');
}

function backlogByProduct(): Record<ProductType, number> {
  const backlog = zeroProductRecord();
  for (const customer of activeCustomers()) backlog[customer.product] += Math.max(0, customer.quantity - customer.fulfilled);
  return backlog;
}

function inFlightByProduct(): Record<ProductType, number> {
  const counts = zeroProductRecord();
  for (const job of jobs) counts[job.product] += 1;
  for (const product of productTypes) counts[product] += finishedStock[product];
  return counts;
}

function openNeedByProduct(): Record<ProductType, number> {
  const backlog = backlogByProduct();
  const inFlight = inFlightByProduct();
  const need = zeroProductRecord();
  for (const product of productTypes) {
    const target = backlog[product] + shelfTargets[product];
    need[product] = Math.max(0, Math.ceil(target - inFlight[product]));
  }
  return need;
}

function createCustomer(nowMinute: number): void {
  if (activeCustomers().length >= maxWaitingCustomers) {
    nextOrderAtMinute = nowMinute + 0.9;
    return;
  }
  addCustomer(nowMinute);
  scheduleNextCustomer(nowMinute);
  fulfillFromStock();
  requestPlanSoon();
}

function addCustomer(nowMinute: number): void {
  const product = weightedRandomProduct();
  const quantity = 1 + (Math.random() < 0.32 ? 1 : 0) + (Math.random() < 0.08 ? 1 : 0);
  customers.push({ id: customerId++, product, quantity, fulfilled: 0, state: 'walking', createdAtMinute: nowMinute });
}

function seedOpeningCustomers(): void {
  if (activeCustomers().length > 0) return;
  addCustomer(shopMinute - 0.7);
  addCustomer(shopMinute - 0.2);
  addCustomer(shopMinute);
  nextOrderAtMinute = shopMinute + 0.45;
  fulfillFromStock();
  requestPlanSoon();
}

function scheduleNextCustomer(nowMinute: number): void {
  const waitingCount = activeCustomers().length;
  if (waitingCount < 4) {
    nextOrderAtMinute = nowMinute + 0.45 + Math.random() * 0.45;
    return;
  }
  nextOrderAtMinute = nowMinute + 1.1 + Math.random() * 0.9;
}

function weightedRandomProduct(): ProductType {
  const pool: ProductType[] = ['bread', 'bread', 'bread', 'croissant', 'croissant', 'chocolate_croissant', 'fruit_tart', 'cupcake', 'cake'];
  return pool[Math.floor(Math.random() * pool.length)] ?? 'bread';
}

function requestPlanSoon(): void {
  pendingPlanRequest = true;
  const minNextPlanMinute = lastPlanMinute + Math.max(trafficTickMinutes(), 0.25);
  nextPlanAtMinute = Math.min(nextPlanAtMinute, Math.max(shopMinute, minNextPlanMinute));
}

async function solvePlan(): Promise<void> {
  if (solving) {
    pendingPlanRequest = true;
    return;
  }
  lastPlanMinute = shopMinute;
  pendingPlanRequest = false;
  const need = openNeedByProduct();
  if (Object.values(need).every((value) => value <= 0) && !hasPendingFactoryWork()) {
    plan = null;
    renderPlanDependentViews();
    return;
  }
  solving = true;
  activeSolveKind = null;
  lastError = '';
  renderMetrics();
  try {
    if (!initialized) {
      await initMathOpt();
      initialized = true;
    }
    setWorkerBridgeEnabled(workerBridgeToggle?.checked ?? true);
    const hadPlanner = planner !== null;
    const nextPlanner = await ensurePlanner();
    const solveKind: PlanSolveKind = hadPlanner ? 'partial' : 'full';
    activeSolveKind = solveKind;
    renderMetrics();
    let result = null as Awaited<ReturnType<typeof solveWithPlanner>> | null;
    let startDecisions: StartDecision[] = [];
    let desiredStarts = zeroProductRecord();
    let launched = zeroProductRecord();
    if (Object.values(need).some((value) => value > 0)) {
      updatePlanner(nextPlanner, need);
      result = await solveWithPlanner(nextPlanner);
      startDecisions = plannedStartDecisions(result.variableValues, nextPlanner);
      desiredStarts = summarizeStartDecisions(startDecisions);
      launched = launchFromPlan(startDecisions);
    }
    const trafficStatus = await planTrafficDispatches();
    dispatchReadyInputs();
    movementPlanStatus = trafficStatus;
    plan = {
      status: result?.terminationReason ?? 'TERMINATION_REASON_OPTIMAL',
      starts: desiredStarts,
      need,
      launched,
      bottlenecks: bottlenecks(desiredStarts),
      objective: result?.objectiveValue ?? 0,
      incremental: true,
      solveKind,
    };
  } catch (error) {
    lastError = (error as Error).message;
  } finally {
    solving = false;
    activeSolveKind = null;
    renderPlanDependentViews();
    nextPlanAtMinute = pendingPlanRequest ? shopMinute : Number.POSITIVE_INFINITY;
  }
}

async function ensurePlanner(): Promise<PlannerModel> {
  if (planner) return planner;
  const model = MathOpt.Model('rolling_bakery_cp_sat_planner');
  const starts = Object.fromEntries(productTypes.map((product) => [
    product,
    Array.from({ length: planSlotCount }, (_, slot) => model.addIntegerVariable({
      lowerBound: 0,
      upperBound: 0,
      name: `start_${product}_slot_${slot}`,
    })),
  ])) as Record<ProductType, MathOptVariable[]>;

  const demandConstraints = Object.fromEntries(productTypes.map((product) => [
    product,
    model.addLinearConstraint({
      upperBound: 0,
      name: `demand_${product}`,
      terms: starts[product].map((variable) => ({ variable, coefficient: 1 })),
    }),
  ])) as Record<ProductType, MathOptLinearConstraint>;

  const resourceConstraints = Object.fromEntries(resourceTypes.map((resource) => [
    resource,
    model.addLinearConstraint({
      upperBound: scaledResourceStock(resource),
      name: `available_${resource}`,
      terms: productTypes.flatMap((product) => starts[product].map((variable) => ({
        variable,
        coefficient: scaledResourceUse(product, resource),
      }))),
    }),
  ])) as Record<ResourceType, MathOptLinearConstraint>;

  const processConstraints = Object.fromEntries(processTypes.map((process) => [
    process,
    Array.from({ length: planSlotCount }, (_, bucket) => {
      const terms = productTypes.flatMap((product) => starts[product].flatMap((variable, startSlot) => {
        const overlap = processOverlapMinutes(product, process, startSlot, bucket);
        return overlap > 0 ? [{ variable, coefficient: Math.round(overlap * processScale) }] : [];
      }));
      return model.addLinearConstraint({
        upperBound: processCapacityForSlot(process, bucket),
        name: `capacity_${process}_slot_${bucket}`,
        terms,
      });
    }),
  ])) as Record<ProcessType, MathOptLinearConstraint[]>;

  const totalStartsConstraint = model.addLinearConstraint({
    upperBound: maxStartsPerPlan,
    name: 'starts_this_tick',
    terms: productTypes.map((product) => ({ variable: starts[product][0], coefficient: 1 })),
  });

  model.maximize(productTypes.flatMap((product) => starts[product].map((variable, slot) => ({
    variable,
    coefficient: objectiveCoefficient(product, slot, zeroProductRecord()),
  }))));

  const solver = new MathOpt.IncrementalSolver(model, MathOpt.SolverType.CP_SAT, cpSatPlannerOptions());
  planner = {
    model,
    solver,
    starts,
    demandConstraints,
    resourceConstraints,
    processConstraints,
    totalStartsConstraint,
  };
  return planner;
}

function updatePlanner(current: PlannerModel, need: Record<ProductType, number>): void {
  const oldestWaitMinutes = oldestWaitByProduct();
  for (const product of productTypes) {
    current.demandConstraints[product].upperBound = need[product];
    for (let slot = 0; slot < planSlotCount; slot += 1) {
      const variable = current.starts[product][slot];
      const slotCapacity = slot === 0 ? Math.max(0, maxWip - jobs.length) : maxStartsPerPlan;
      variable.upperBound = Math.min(need[product], slotCapacity);
      current.model.objective.setLinearCoefficient(variable, objectiveCoefficient(product, slot, oldestWaitMinutes));
    }
  }
  for (const resource of resourceTypes) current.resourceConstraints[resource].upperBound = scaledResourceStock(resource);
  for (const process of processTypes) {
    current.processConstraints[process].forEach((constraint, bucket) => {
      constraint.upperBound = processCapacityForSlot(process, bucket);
    });
  }
  current.totalStartsConstraint.upperBound = Math.min(maxStartsPerPlan, Math.max(0, maxWip - jobs.length));
}

async function solveWithPlanner(current: PlannerModel) {
  return current.solver.solve(cpSatPlannerOptions());
}

function releaseInputFromPlan(release: ScheduledInputRelease, source: Source, machine: Machine, plannedRouteIndexLimit?: number): void {
  if (release.released) {
    debugFactoryPlan('release skipped: already released', { releaseId: release.id, input: release.input });
    return;
  }
  const owningJob = jobs.find((candidate) => candidate.inputReleases.includes(release));
  if (!owningJob) {
    debugFactoryPlan('release skipped: owning job missing', { releaseId: release.id, input: release.input });
    return;
  }
  const route = routeBetween(source, machine);
  if (!route) {
    debugFactoryPlan('release skipped: no route', { releaseId: release.id, input: release.input, source: source.type, machineId: machine.id });
    return;
  }
  const token: MaterialToken = {
    id: tokenId++,
    jobId: owningJob.id,
    material: release.input,
    x: source.x,
    y: source.y,
    phase: 'moving_to_machine',
    route,
    routeIndex: 0,
    plannedRouteIndexLimit: plannedRouteIndexLimit ?? route.length,
    process: recipes[owningJob.product].steps[release.stepIndex].process,
    stepIndex: release.stepIndex,
    machineId: machine.id,
    remainingMinutes: 0,
  };
  tokens.push(token);
  release.released = true;
  release.tokenId = token.id;
  release.plannedDispatchMinute = null;
  debugFactoryPlan('released input', {
    releaseId: release.id,
    tokenId: token.id,
    input: release.input,
    jobId: owningJob.id,
    product: owningJob.product,
    machineId: machine.id,
    plannedRouteIndexLimit: plannedRouteIndexLimit ?? route.length,
    routeLength: route.length,
  });
}

function isMachineCellOccupiedByOtherJob(machine: Machine, job: Job): boolean {
  const machineKey = pointKey(machine);
  return tokens.some((token) => token.jobId !== job.id && pointKey(currentCellForToken(token)) === machineKey);
}

function dispatchReadyInputs(): void {
  const dispatched: Array<{ jobId: number; product: ProductType; stepIndex: number; inputs: ResourceType[]; machineId: string }> = [];
  for (const job of jobs) {
    if (job.status === 'done') continue;
    for (const release of job.inputReleases) {
      if (release.released) continue;
      if (release.stepIndex !== job.stepIndex) continue;
      if (release.plannedDispatchMinute === null || release.plannedDispatchMinute > shopMinute + 1e-6) continue;
      const scheduled = job.stepSchedule[release.stepIndex];
      const machine = machineLayout.find((candidate) => candidate.id === release.machineId);
      if (!scheduled || !machine) continue;
      const source = sourceDefinitions[sourceForResource[release.input]];
      releaseInputFromPlan(release, source, machine);
      let group = dispatched.find((item) => (
        item.jobId === job.id
          && item.stepIndex === release.stepIndex
          && item.machineId === machine.id
      ));
      if (!group) {
        group = { jobId: job.id, product: job.product, stepIndex: release.stepIndex, inputs: [], machineId: machine.id };
        dispatched.push(group);
      }
      group.inputs.push(release.input);
    }
  }
  if (dispatched.length > 0) debugFactoryPlan('committed ready input groups', dispatched);
}

async function planTrafficDispatches(): Promise<string> {
  const candidates = buildTrafficReleaseCandidates();
  if (candidates.length === 0) return 'No traffic candidates';

  const model = MathOpt.Model('bakery_conveyor_traffic');
  const decisionTerms: Array<{ variable: MathOptVariable; coefficient: number }> = [];
  const choicesByRelease = new Map<number, Array<{ variable: MathOptVariable; tick: number; candidate: TrafficReleaseCandidate }>>();
  const occupancyTerms = new Map<string, Array<{ variable: MathOptVariable; coefficient: number }>>();
  const groupTerms = new Map<string, Array<{ variable: MathOptVariable; coefficient: number }>>();
  const groupCandidateCounts = new Map<string, number>();
  const groupMachines = new Map<string, string>();
  const groupVariables = new Map<string, MathOptVariable>();
  const reserved = existingTrafficReservations(trafficPlanHorizonTicks);

  for (const candidate of candidates) {
    const latestRouteStartTick = trafficPlanHorizonTicks - (candidate.routeWithStart.length - 1);
    if (latestRouteStartTick < 0) continue;
    const windowStart = Math.max(0, Math.min(latestRouteStartTick, candidate.preferredDispatchTick - trafficDispatchSlackTicks));
    const windowEnd = Math.min(latestRouteStartTick, Math.max(trafficDispatchSlackTicks, candidate.preferredDispatchTick + trafficDispatchSlackTicks));
    const choices: Array<{ variable: MathOptVariable; tick: number; candidate: TrafficReleaseCandidate }> = [];
    const groupVariable = trafficGroupVariable(model, groupVariables, candidate.groupKey);
    groupCandidateCounts.set(candidate.groupKey, (groupCandidateCounts.get(candidate.groupKey) ?? 0) + 1);
    groupMachines.set(candidate.groupKey, candidate.machine.id);
    for (let tick = windowStart; tick <= windowEnd; tick += 1) {
      const variable = model.addBinaryVariable({ name: `dispatch_${candidate.release.id}_at_${tick}` });
      choices.push({ variable, tick, candidate });
      const terms = groupTerms.get(candidate.groupKey) ?? [];
      terms.push({ variable, coefficient: 1 });
      groupTerms.set(candidate.groupKey, terms);
      const timingPenalty = Math.abs(tick - candidate.preferredDispatchTick) * 45 + tick;
      decisionTerms.push({
        variable,
        coefficient: 100000 + candidate.priority * 100 - timingPenalty,
      });
      candidate.routeWithStart.forEach((point, offset) => {
        const occupancyTick = tick + offset;
        if (occupancyTick > trafficPlanHorizonTicks) return;
        const key = trafficOccupancyKey(point, occupancyTick);
        const terms = occupancyTerms.get(key) ?? [];
        terms.push({ variable, coefficient: 1 });
        occupancyTerms.set(key, terms);
      });
    }
    model.addLinearConstraint({
      upperBound: 0,
      name: `release_claim_${candidate.release.id}`,
      terms: choices.map((choice) => ({ variable: choice.variable, coefficient: 1 })).concat({ variable: groupVariable, coefficient: -1 }),
    });
    if (choices.length > 0) {
      choicesByRelease.set(candidate.release.id, choices);
      model.addLinearConstraint({
        lowerBound: 0,
        upperBound: 1,
        name: `choose_release_${candidate.release.id}`,
        terms: choices.map((choice) => ({ variable: choice.variable, coefficient: 1 })),
      });
    }
  }

  for (const [groupKey, terms] of groupTerms) {
    const groupVariable = groupVariables.get(groupKey);
    const count = groupCandidateCounts.get(groupKey) ?? 1;
    if (!groupVariable) continue;
    model.addLinearConstraint({
      upperBound: 0,
      name: `group_claim_${groupKey}`,
      terms: terms.concat({ variable: groupVariable, coefficient: -count }),
    });
  }

  for (const machine of machineLayout) {
    const terms = [...groupVariables]
      .filter(([groupKey]) => groupMachines.get(groupKey) === machine.id)
      .map(([, variable]) => ({ variable, coefficient: 1 }));
    if (terms.length <= 1) continue;
    model.addLinearConstraint({
      upperBound: 1,
      name: `machine_claim_${machine.id}`,
      terms,
    });
  }

  for (const [key, terms] of occupancyTerms) {
    const upperBound = Math.max(0, 1 - (reserved.get(key) ?? 0));
    model.addLinearConstraint({
      upperBound,
      name: `occupy_${key}`,
      terms,
    });
  }

  if (decisionTerms.length === 0) return 'No dispatch window';

  model.maximize(decisionTerms);
  const result = await MathOpt.solve(model, {
    solverType: MathOpt.SolverType.CP_SAT,
    threads: currentThreadCount(),
    timeLimitSeconds: 0.45,
    cpSat: {
      numWorkers: currentThreadCount(),
      maxTimeInSeconds: 0.45,
      randomSeed: 11,
      stopAfterFirstSolution: false,
    },
  });

  let plannedCount = 0;
  for (const choices of choicesByRelease.values()) {
    const selected = choices.find((choice) => (result.variableValues[choice.variable.name] ?? 0) > 0.5);
    if (!selected) continue;
    selected.candidate.release.plannedDispatchMinute = shopMinute + selected.tick * trafficTickMinutes();
    plannedCount += 1;
  }

  const trafficPlanData = {
    status: result.terminationReason,
    candidates: candidates.length,
    planned: plannedCount,
    objective: result.objectiveValue,
  };
  if (plannedCount > 0) {
    debugFactoryPlan('traffic plan', trafficPlanData);
  } else {
    debugFactoryPlanOnChange('traffic-plan-zero', 'traffic plan', trafficPlanData);
  }
  return `Traffic ${plannedCount}/${candidates.length}`;
}

function buildTrafficReleaseCandidates(): TrafficReleaseCandidate[] {
  const candidates: TrafficReleaseCandidate[] = [];
  for (const job of jobs) {
    if (job.status === 'done') continue;
    for (const release of job.inputReleases) {
      if (release.released) continue;
      if (release.stepIndex !== job.stepIndex) continue;
      if (release.plannedDispatchMinute !== null && release.plannedDispatchMinute > shopMinute + 1e-6) continue;
      const scheduled = job.stepSchedule[release.stepIndex];
      const source = sourceDefinitions[sourceForResource[release.input]];
      const machine = machineLayout.find((candidate) => candidate.id === release.machineId);
      if (!scheduled || !machine) continue;
      if (machineHasOtherJobTraffic(machine, job)) continue;
      const route = routeBetween(source, machine);
      if (!route) continue;
      const routeWithStart = [gridPoint(source), ...route.map(gridPoint)];
      const dueTick = Math.max(0, Math.ceil((scheduled.startMinute - shopMinute) / trafficTickMinutes()));
      const preferredDispatchTick = Math.max(0, dueTick - (routeWithStart.length - 1));
      if (preferredDispatchTick > trafficPlanHorizonTicks + trafficDispatchSlackTicks) continue;
      candidates.push({
        job,
        release,
        source,
        machine,
        groupKey: trafficGroupKey(job, release),
        route,
        routeWithStart,
        preferredDispatchTick,
        priority: trafficCandidatePriority(job, release),
      });
    }
  }
  return candidates
    .sort((left, right) => (
      left.preferredDispatchTick - right.preferredDispatchTick
        || right.priority - left.priority
        || left.release.id - right.release.id
    ))
    .slice(0, trafficCandidateLimit);
}

function trafficGroupVariable(model: MathOptModel, variables: Map<string, MathOptVariable>, groupKey: string): MathOptVariable {
  const existing = variables.get(groupKey);
  if (existing) return existing;
  const variable = model.addBinaryVariable({ name: `claim_${groupKey}` });
  variables.set(groupKey, variable);
  return variable;
}

function trafficGroupKey(job: Job, release: ScheduledInputRelease): string {
  return `${job.id}_${release.stepIndex}_${release.machineId}`;
}

function trafficCandidatePriority(job: Job, release: ScheduledInputRelease): number {
  const wait = activeCustomers()
    .filter((customer) => customer.product === job.product)
    .reduce((max, customer) => Math.max(max, shopMinute - customer.createdAtMinute), 0);
  const currentStepBonus = release.stepIndex === job.stepIndex ? 80 : 0;
  return recipes[job.product].priority + currentStepBonus + Math.round(wait * 8);
}

function machineHasOtherJobTraffic(machine: Machine, job: Job): boolean {
  if (jobs.some((candidate) => (
    candidate.id !== job.id
      && candidate.status === 'loading'
      && candidate.loadingMachineId === machine.id
  ))) {
    return true;
  }
  if (machine.tokenId !== null) {
    const token = tokens.find((candidate) => candidate.id === machine.tokenId);
    if (!token || token.jobId !== job.id) return true;
  }
  return tokens.some((token) => (
    token.jobId !== job.id
      && token.machineId === machine.id
      && tokenClaimsMachine(token)
  )) || jobs.some((candidate) => (
    candidate.id !== job.id
      && candidate.inputReleases.some((release) => (
        !release.released
          && release.machineId === machine.id
          && release.plannedDispatchMinute !== null
      ))
  ));
}

function tokenClaimsMachine(token: MaterialToken): boolean {
  return token.phase === 'loaded'
    || (token.phase === 'moving_to_machine' && token.plannedRouteIndexLimit >= token.route.length);
}

function existingTrafficReservations(horizonTicks: number): Map<string, number> {
  const reservations = new Map<string, number>();
  const reserve = (point: Point, tick: number) => {
    const key = trafficOccupancyKey(point, tick);
    reservations.set(key, (reservations.get(key) ?? 0) + 1);
  };

  for (const token of tokens) {
    if (token.phase === 'moving_to_machine' || token.phase === 'delivering') {
      const start = currentCellForToken(token);
      reserve(start, 0);
      for (let tick = 1; tick <= horizonTicks; tick += 1) {
        const routeIndex = Math.min(token.route.length - 1, token.routeIndex + tick - 1);
        if (routeIndex < 0 || routeIndex >= token.route.length) break;
        reserve(token.route[routeIndex], tick);
      }
    } else if (token.phase === 'processing') {
      const busyTicks = Math.min(horizonTicks, Math.ceil(token.remainingMinutes / trafficTickMinutes()));
      for (let tick = 0; tick <= busyTicks; tick += 1) reserve(token, tick);
    } else if (token.phase === 'loaded' && token.machineId === null) {
      for (let tick = 0; tick <= horizonTicks; tick += 1) reserve(token, tick);
    }
  }
  for (const job of jobs) {
    if (job.status === 'done') continue;
    for (const release of job.inputReleases) {
      if (release.released || release.plannedDispatchMinute === null) continue;
      const startTick = Math.round((release.plannedDispatchMinute - shopMinute) / trafficTickMinutes());
      if (startTick < 0 || startTick > horizonTicks) continue;
      const source = sourceDefinitions[sourceForResource[release.input]];
      const machine = machineLayout.find((candidate) => candidate.id === release.machineId);
      if (!machine) continue;
      const route = routeBetween(source, machine);
      if (!route) continue;
      const routeWithStart = [gridPoint(source), ...route.map(gridPoint)];
      routeWithStart.forEach((point, offset) => {
        const tick = startTick + offset;
        if (tick <= horizonTicks) reserve(point, tick);
      });
    }
  }

  return reservations;
}

function trafficOccupancyKey(point: Point, tick: number): string {
  return `${pointKey(gridPoint(point))}@${tick}`;
}

function trafficTickMinutes(): number {
  return 1 / (tokenSpeedCellsPerSecond * realSecondsPerShopMinute);
}

function plannedStartDecisions(variableValues: Record<string, number>, current: PlannerModel): StartDecision[] {
  const decisions: StartDecision[] = [];
  const slotLimit = Math.min(prefetchSlotCount, planSlotCount);
  for (const product of productTypes) {
    for (let slot = 0; slot < slotLimit; slot += 1) {
      const variable = current.starts[product][slot];
      const count = Math.max(0, Math.round(variableValues[variable.name] ?? 0));
      if (count > 0) decisions.push({ product, slot, count });
    }
  }
  return decisions.sort((a, b) => a.slot - b.slot || recipes[b.product].priority - recipes[a.product].priority);
}

function summarizeStartDecisions(decisions: StartDecision[]): Record<ProductType, number> {
  const starts = zeroProductRecord();
  for (const decision of decisions) starts[decision.product] += decision.count;
  return starts;
}

function cpSatPlannerOptions() {
  return {
    threads: currentThreadCount(),
    timeLimitSeconds: 1,
    relativeGapTolerance: 0,
    cpSat: {
      numWorkers: currentThreadCount(),
      maxTimeInSeconds: 1,
      randomSeed: 7,
      stopAfterFirstSolution: false,
    },
  };
}

function scaledResourceUse(product: ProductType, resource: ResourceType): number {
  return Math.round((recipes[product].resources[resource] ?? 0) * resourceScale);
}

function scaledResourceStock(resource: ResourceType): number {
  return Math.floor(Math.max(0, ingredientStock[resource]) * resourceScale);
}

function objectiveCoefficient(product: ProductType, slot: number, waits: Record<ProductType, number>): number {
  const completionMinutes = slot * planSlotMinutes + recipeTotalMinutes(product);
  const immediacyBonus = slot === 0 ? 18 : 0;
  return Math.max(1, Math.round(
    recipes[product].priority * 10
      + waits[product] * 14
      + immediacyBonus
      - completionMinutes * 2
      - slot * 9,
  ));
}

function recipeTotalMinutes(product: ProductType): number {
  return recipes[product].steps.reduce((sum, step) => sum + step.minutes, 0);
}

function processOverlapMinutes(product: ProductType, process: ProcessType, startSlot: number, bucket: number): number {
  const bucketStart = bucket * planSlotMinutes;
  const bucketEnd = bucketStart + planSlotMinutes;
  let cursor = startSlot * planSlotMinutes;
  let overlap = 0;
  for (const step of recipes[product].steps) {
    const stepStart = cursor;
    const stepEnd = stepStart + step.minutes;
    if (step.process === process) {
      overlap += Math.max(0, Math.min(stepEnd, bucketEnd) - Math.max(stepStart, bucketStart));
    }
    cursor = stepEnd;
  }
  return overlap;
}

function stepStartOffsetMinutes(product: ProductType, stepIndex: number): number {
  return recipes[product].steps.slice(0, stepIndex).reduce((sum, step) => sum + step.minutes, 0);
}

function processCapacityForSlot(process: ProcessType, bucket: number): number {
  const baseCapacity = processorCounts[process] * planSlotMinutes;
  const occupied = currentReservedLoadForSlot(process, bucket);
  return Math.max(0, Math.floor((baseCapacity - occupied) * processScale));
}

function currentReservedLoadForSlot(process: ProcessType, bucket: number): number {
  const bucketStart = bucket * planSlotMinutes;
  const bucketEnd = bucketStart + planSlotMinutes;
  let load = 0;
  for (const token of tokens.filter((candidate) => candidate.phase === 'processing' && candidate.process === process)) {
    load += intervalOverlap(0, token.remainingMinutes, bucketStart, bucketEnd);
  }
  for (const job of jobs) {
    if (job.status === 'done') continue;
    for (let stepIndex = job.stepIndex; stepIndex < recipes[job.product].steps.length; stepIndex += 1) {
      const step = recipes[job.product].steps[stepIndex];
      if (step.process !== process) continue;
      if (job.status === 'processing' && stepIndex === job.stepIndex) continue;
      const scheduled = job.stepSchedule[stepIndex];
      if (!scheduled) continue;
      const start = Math.max(0, scheduled.startMinute - shopMinute);
      load += intervalOverlap(start, start + step.minutes, bucketStart, bucketEnd);
    }
  }
  return load;
}

function intervalOverlap(start: number, end: number, bucketStart: number, bucketEnd: number): number {
  return Math.max(0, Math.min(end, bucketEnd) - Math.max(start, bucketStart));
}

function oldestWaitByProduct(): Record<ProductType, number> {
  const waits = zeroProductRecord();
  for (const customer of activeCustomers()) {
    const remaining = customer.quantity - customer.fulfilled;
    if (remaining <= 0) continue;
    waits[customer.product] = Math.max(waits[customer.product], shopMinute - customer.createdAtMinute);
  }
  return waits;
}

function processCapacity(process: ProcessType): number {
  return processorCounts[process] * planningHorizonMinutes;
}

function outstandingBySource(): Record<SourceType, number> {
  const outstanding = Object.fromEntries(sourceTypes.map((source) => [source, 0])) as Record<SourceType, number>;
  for (const token of tokens) {
    if (isResource(token.material) && (token.phase === 'moving_to_machine' || token.phase === 'waiting')) {
      outstanding[sourceForResource[token.material]] += 1;
    }
  }
  return outstanding;
}

function bottlenecks(starts: Record<ProductType, number>): Array<{ label: string; used: number; capacity: number }> {
  return processTypes
    .map((process) => ({
      label: processLabels[process],
      used: productTypes.reduce((sum, product) => {
        const minutes = recipes[product].steps
          .filter((step) => step.process === process)
          .reduce((stageSum, step) => stageSum + step.minutes, 0);
        return sum + starts[product] * minutes;
      }, 0),
      capacity: processCapacity(process),
    }))
    .filter((item) => item.capacity > 0)
    .sort((a, b) => b.used / b.capacity - a.used / a.capacity)
    .slice(0, 3);
}

function launchFromPlan(decisions: StartDecision[]): Record<ProductType, number> {
  const launched = zeroProductRecord();
  for (const decision of decisions) {
    for (let count = 0; count < decision.count; count += 1) {
      if (jobs.length >= maxWip) return launched;
      const product = decision.product;
      if (!hasIngredients(product)) break;
      const job = createJob(product, decision.slot);
      if (!job) break;
      consumeIngredients(product);
      jobs.push(job);
      launched[product] += 1;
    }
  }
  return launched;
}

function hasIngredients(product: ProductType): boolean {
  return Object.entries(recipes[product].resources).every(([resource, amount]) => ingredientStock[resource as ResourceType] + 1e-6 >= (amount ?? 0));
}

function consumeIngredients(product: ProductType): void {
  for (const [resource, amount] of Object.entries(recipes[product].resources) as Array<[ResourceType, number]>) {
    ingredientStock[resource] = Math.max(0, ingredientStock[resource] - amount);
  }
}

function createJob(product: ProductType, startSlot: number): Job | null {
  const id = jobId++;
  const scheduledStartMinute = shopMinute + startSlot * planSlotMinutes;
  const stepSchedule = plannedStepSchedule(product, scheduledStartMinute, id);
  if (!stepSchedule) return null;
  const job: Job = {
    id,
    product,
    scheduledStartMinute,
    stepIndex: 0,
    currentMaterial: null,
    currentTokenId: null,
    inputTokenIds: [],
    loadingMachineId: null,
    stepSchedule,
    inputReleases: plannedInputReleases(product, stepSchedule),
    status: 'collecting',
  };
  return job;
}

function plannedStepSchedule(product: ProductType, scheduledStartMinute: number, sequence: number): PlannedStep[] | null {
  const schedule: PlannedStep[] = [];
  for (let stepIndex = 0; stepIndex < recipes[product].steps.length; stepIndex += 1) {
    const machine = plannedMachineForStep(product, stepIndex, sequence, schedule);
    if (!machine) {
      lastError = `No active ${processLabels[recipes[product].steps[stepIndex].process]} for ${productLabels[product]}.`;
      return null;
    }
    schedule.push({
      stepIndex,
      machineId: machine.id,
      startMinute: scheduledStartMinute + stepStartOffsetMinutes(product, stepIndex),
    });
  }
  return schedule;
}

function plannedInputReleases(product: ProductType, stepSchedule: PlannedStep[]): ScheduledInputRelease[] {
  return recipes[product].steps.flatMap((step, stepIndex) => {
    const machine = machineLayout.find((candidate) => candidate.id === stepSchedule[stepIndex].machineId);
    if (!machine) return [];
    return step.inputs.flatMap((input) => {
      if (!isResource(input)) return [];
      return [{
        id: releaseId++,
        stepIndex,
        input,
        machineId: machine.id,
        released: false,
        tokenId: null,
        plannedDispatchMinute: null,
      }];
    });
  });
}

function isResource(material: MaterialType): material is ResourceType {
  return material in sourceForResource;
}

function routeBetween(from: Point, to: Point): Point[] | null {
  const start = gridPoint(from);
  const target = gridPoint(to);
  const startKey = pointKey(start);
  const targetKey = pointKey(target);
  if (startKey === targetKey) return [];
  const queue = [start];
  const previous = new Map<string, string | null>([[startKey, null]]);
  const points = new Map<string, Point>([[startKey, start]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (pointKey(current) === targetKey) break;
    for (const next of routeNeighbors(current, start, target)) {
      const key = pointKey(next);
      if (previous.has(key)) continue;
      previous.set(key, pointKey(current));
      points.set(key, next);
      queue.push(next);
    }
  }
  if (!previous.has(targetKey)) return null;
  const route: Point[] = [];
  let key: string | null = targetKey;
  while (key !== null) {
    const point = points.get(key);
    if (point) route.push(point);
    key = previous.get(key) ?? null;
  }
  route.reverse();
  return route.slice(1);
}

function gridPoint(point: Point): Point {
  return {
    x: Math.max(0, Math.min(width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(height - 1, Math.round(point.y))),
  };
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}

function routeNeighbors(point: Point, start: Point, target: Point): Point[] {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x, y: point.y - 1 },
    { x: point.x, y: point.y + 1 },
    { x: point.x - 1, y: point.y },
  ].filter((next) => isRouteCell(next, start, target) && canTraverseDirectedEdge(point, next, start, target));
}

function canTraverseDirectedEdge(from: Point, to: Point, start: Point, target: Point): boolean {
  if (pointKey(from) === pointKey(start) || pointKey(to) === pointKey(target)) return true;
  const move = directionBetween(from, to);
  if (!move) return false;
  const fromCell = cells[from.y * width + from.x];
  const toCell = cells[to.y * width + to.x];
  if (fromCell.kind === 'source' || fromCell.kind === 'machine' || fromCell.kind === 'display') {
    return toCell.kind !== 'belt' || toCell.direction === move;
  }
  if (fromCell.kind === 'belt' && fromCell.direction === move) return true;
  return toCell.kind === 'belt' && toCell.direction === move;
}

function directionBetween(from: Point, to: Point): Direction | null {
  if (to.x === from.x + 1 && to.y === from.y) return 'right';
  if (to.x === from.x - 1 && to.y === from.y) return 'left';
  if (to.x === from.x && to.y === from.y + 1) return 'down';
  if (to.x === from.x && to.y === from.y - 1) return 'up';
  return null;
}

function isRouteCell(point: Point, start: Point, target: Point): boolean {
  if (point.x < 0 || point.x >= width || point.y < 0 || point.y >= height) return false;
  const key = pointKey(point);
  if (key === pointKey(start) || key === pointKey(target)) return true;
  const cell = cells[point.y * width + point.x];
  return cell.kind === 'belt' || cell.kind === 'display' || cell.kind === 'source';
}

function simulationStep(dtSeconds: number): void {
  if (solving) {
    renderMetrics();
    return;
  }
  startReadyJobs();
  dispatchReadyInputs();
  const dtMinutes = dtSeconds / realSecondsPerShopMinute;
  shopMinute += dtMinutes;
  advanceMovingTokens(dtSeconds);
  advanceProcessingTokens(dtMinutes);
  fulfillFromStock();
  customers = customers.filter((customer) => customer.state !== 'served' || (customer.servedAtMinute !== undefined && shopMinute - customer.servedAtMinute < servedExitMinutes));
  for (const customer of customers) {
    if (customer.state === 'walking' && shopMinute - customer.createdAtMinute >= 0.5) customer.state = 'waiting';
  }
  if (shopMinute >= nextOrderAtMinute) createCustomer(shopMinute);
  if (shopMinute >= nextPlanAtMinute) {
    if (solving) {
      pendingPlanRequest = true;
    } else {
      nextPlanAtMinute = Number.POSITIVE_INFINITY;
      void solvePlan();
    }
  }
}

function hasPendingFactoryWork(): boolean {
  return jobs.some((job) => job.status !== 'done')
    || tokens.some((token) => token.phase !== 'waiting');
}

function advanceMovingTokens(dtSeconds: number): void {
  const reservations = new Set<string>();
  for (const token of tokens) {
    if (!['moving_to_machine', 'delivering'].includes(token.phase)) continue;
    let remainingDistance = tokenSpeedCellsPerSecond * dtSeconds;
    const routeIndexLimit = Math.min(token.route.length, token.plannedRouteIndexLimit);
    while (remainingDistance > 0 && token.routeIndex < routeIndexLimit) {
      const target = token.route[token.routeIndex];
      if (isCellBlockedForToken(target, token.id, reservations)) {
        const waitingCell = currentCellForToken(token);
        token.x = waitingCell.x;
        token.y = waitingCell.y;
        reservations.add(pointKey(waitingCell));
        break;
      }
      const distance = Math.hypot(target.x - token.x, target.y - token.y);
      if (distance <= remainingDistance || distance < 1e-6) {
        token.x = target.x;
        token.y = target.y;
        token.routeIndex += 1;
        remainingDistance -= distance;
        reservations.add(pointKey(target));
      } else {
        const ratio = remainingDistance / distance;
        token.x += (target.x - token.x) * ratio;
        token.y += (target.y - token.y) * ratio;
        reservations.add(pointKey(target));
        remainingDistance = 0;
      }
    }
    if (token.routeIndex >= token.route.length) arrive(token);
  }
}

function isCellBlockedForToken(point: Point, tokenIdToMove: number, reservations: Set<string>): boolean {
  const key = pointKey(point);
  if (reservations.has(key)) return true;
  const movingToken = tokens.find((token) => token.id === tokenIdToMove);
  return tokens.some((token) => {
    if (token.id === tokenIdToMove || pointKey(currentCellForToken(token)) !== key) return false;
    return !canShareMachineCell(movingToken, token, point);
  });
}

function canShareMachineCell(movingToken: MaterialToken | undefined, otherToken: MaterialToken, point: Point): boolean {
  if (!movingToken || movingToken.phase !== 'moving_to_machine' || otherToken.phase !== 'loaded') return false;
  if (movingToken.jobId !== otherToken.jobId || movingToken.machineId !== otherToken.machineId || movingToken.machineId === null) return false;
  const machine = machineLayout.find((candidate) => candidate.id === movingToken.machineId);
  return machine !== undefined && pointKey(machine) === pointKey(point);
}

function currentCellForToken(token: MaterialToken): Point {
  if (isMovingToken(token) && token.routeIndex > 0) return token.route[token.routeIndex - 1];
  if (isMovingToken(token) && token.routeIndex < token.route.length) return firstSegmentStartCell(token);
  return gridPoint(token);
}

function firstSegmentStartCell(token: MaterialToken): Point {
  const target = token.route[token.routeIndex];
  const xDirection = Math.sign(target.x - token.x);
  if (xDirection !== 0) return { x: target.x - xDirection, y: target.y };
  const yDirection = Math.sign(target.y - token.y);
  if (yDirection !== 0) return { x: target.x, y: target.y - yDirection };
  return gridPoint(token);
}

function isMovingToken(token: MaterialToken): boolean {
  return token.phase === 'moving_to_machine' || token.phase === 'delivering';
}

function arrive(token: MaterialToken): void {
  if (token.phase === 'moving_to_machine') {
    token.phase = 'loaded';
    token.route = [];
    token.routeIndex = 0;
    const job = jobsById(token.jobId);
    if (job?.status === 'loading' && job.stepIndex === token.stepIndex) startProcessingIfLoaded(job);
    requestPlanSoon();
  } else if (token.phase === 'delivering') {
    const job = jobsById(token.jobId);
    if (job) {
      finishedStock[job.product] += 1;
      job.status = 'done';
    }
    tokens = tokens.filter((candidate) => candidate.id !== token.id);
    jobs = jobs.filter((candidate) => candidate.status !== 'done');
  }
}

function startReadyJobs(): void {
  const readyJobs = jobs
    .filter((job) => job.status === 'collecting')
    .sort((left, right) => (left.stepSchedule[left.stepIndex]?.startMinute ?? 0) - (right.stepSchedule[right.stepIndex]?.startMinute ?? 0));
  for (const job of readyJobs) {
    if (job.status !== 'collecting') continue;
    activateCurrentStep(job);
  }
}

function activateCurrentStep(job: Job): void {
  const scheduled = job.stepSchedule[job.stepIndex];
  if (!scheduled || scheduled.startMinute > shopMinute + 1e-6) {
    return;
  }
  const machine = machineLayout.find((candidate) => candidate.id === scheduled.machineId);
  if (!machine) {
    debugFactoryPlan('activate skipped: machine missing', {
      jobId: job.id,
      product: job.product,
      stepIndex: job.stepIndex,
      machineId: scheduled.machineId,
    });
    return;
  }
  const hasUnreleasedRawInputs = hasUnreleasedRawInputsForCurrentStep(job);
  const hasUnplannedRawInputs = hasUnplannedRawInputsForCurrentStep(job);
  if (hasUnreleasedRawInputs) {
    if (hasUnplannedRawInputs) requestPlanSoon();
    return;
  }
  const step = recipes[job.product].steps[job.stepIndex];
  if (!canAcquireMachineForJob(machine, job)) {
    const busyState = {
      jobId: job.id,
      product: job.product,
      stepIndex: job.stepIndex,
      machineId: machine.id,
      machineTokenId: machine.tokenId,
      loadingJobIds: jobs.filter((candidate) => candidate.status === 'loading' && candidate.loadingMachineId === machine.id).map((candidate) => candidate.id),
      claimedTokens: tokens.filter((token) => token.machineId === machine.id && tokenClaimsMachine(token)).map((token) => ({
        id: token.id,
        jobId: token.jobId,
        material: token.material,
        phase: token.phase,
        stepIndex: token.stepIndex,
      })),
    };
    debugFactoryPlanOnChange(`activate-busy:${job.id}:${job.stepIndex}:${machine.id}`, 'activate skipped: machine busy or claimed', busyState);
    return;
  }
  job.loadingMachineId = machine.id;
  job.status = 'loading';
  job.inputTokenIds = tokens
    .filter((token) => token.jobId === job.id && token.stepIndex === job.stepIndex && token.machineId === machine.id)
    .map((token) => token.id);

  if (job.currentMaterial !== null && job.currentTokenId !== null && step.inputs.includes(job.currentMaterial)) {
    const token = tokens.find((candidate) => candidate.id === job.currentTokenId);
    const route = token ? routeBetween(token, machine) : null;
    if (!token || !route) {
      lastError = `No conveyor route from ${materialViews[job.currentMaterial].label} to ${machine.label}.`;
      debugFactoryPlan('activate failed: no WIP route to next processor', {
        jobId: job.id,
        product: job.product,
        stepIndex: job.stepIndex,
        currentMaterial: job.currentMaterial,
        currentTokenId: job.currentTokenId,
        machineId: machine.id,
      });
      return;
    }
    token.process = step.process;
    token.stepIndex = job.stepIndex;
    token.machineId = machine.id;
    token.route = route;
    token.routeIndex = 0;
    token.plannedRouteIndexLimit = route.length;
    token.phase = route.length ? 'moving_to_machine' : 'loaded';
    if (!job.inputTokenIds.includes(token.id)) job.inputTokenIds.push(token.id);
    debugFactoryPlan('WIP routed to next processor', {
      jobId: job.id,
      product: job.product,
      tokenId: token.id,
      material: token.material,
      stepIndex: job.stepIndex,
      machineId: machine.id,
      routeLength: route.length,
      phase: token.phase,
      hasUnreleasedRawInputs,
    });
  }
  startProcessingIfLoaded(job);
}

function hasUnreleasedRawInputsForCurrentStep(job: Job): boolean {
  return unreleasedRawInputsForCurrentStep(job).length > 0;
}

function hasUnplannedRawInputsForCurrentStep(job: Job): boolean {
  return unreleasedRawInputsForCurrentStep(job).some((release) => release.plannedDispatchMinute === null);
}

function unreleasedRawInputsForCurrentStep(job: Job): Array<{ id: number; input: ResourceType; machineId: string; plannedDispatchMinute: number | null }> {
  return job.inputReleases.filter((release) => (
    release.stepIndex === job.stepIndex
      && !release.released
  )).map((release) => ({
    id: release.id,
    input: release.input,
    machineId: release.machineId,
    plannedDispatchMinute: release.plannedDispatchMinute,
  }));
}

function canAcquireMachineForJob(machine: Machine, job: Job): boolean {
  if (machine.tokenId !== null) return false;
  if (isMachineCellOccupiedByOtherJob(machine, job)) return false;
  if (jobs.some((candidate) => (
    candidate.id !== job.id
      && candidate.status === 'loading'
      && candidate.loadingMachineId === machine.id
  ))) return false;
  return !tokens.some((token) => (
    token.jobId !== job.id
      && token.machineId === machine.id
      && tokenClaimsMachine(token)
  ));
}

function startProcessingIfLoaded(job: Job): void {
  if (job.status !== 'loading') return;
  if (job.loadingMachineId === null) return;
  const machine = machineLayout.find((candidate) => candidate.id === job.loadingMachineId);
  const step = recipes[job.product].steps[job.stepIndex];
  if (!machine) return;
  const inputTokenIds = loadedInputTokenIdsForStep(job, step, machine.id);
  if (!inputTokenIds) {
    debugFactoryPlan('processing not started: inputs missing at processor', {
      jobId: job.id,
      product: job.product,
      stepIndex: job.stepIndex,
      machineId: machine.id,
      requiredInputs: step.inputs,
      loadedTokens: tokens.filter((token) => token.jobId === job.id && token.stepIndex === job.stepIndex).map((token) => ({
        id: token.id,
        material: token.material,
        phase: token.phase,
        machineId: token.machineId,
      })),
    });
    return;
  }
  tokens = tokens.filter((token) => !inputTokenIds.includes(token.id));
  const processingToken: MaterialToken = {
    id: tokenId++,
    jobId: job.id,
    material: step.output,
    x: machine.x,
    y: machine.y,
    phase: 'processing',
    route: [],
    routeIndex: 0,
    plannedRouteIndexLimit: 0,
    process: step.process,
    stepIndex: job.stepIndex,
    machineId: machine.id,
    remainingMinutes: step.minutes,
  };
  tokens.push(processingToken);
  machine.tokenId = processingToken.id;
  job.currentTokenId = processingToken.id;
  job.inputTokenIds = [];
  job.loadingMachineId = null;
  job.status = 'processing';
  debugFactoryPlan('processing started', {
    jobId: job.id,
    product: job.product,
    tokenId: processingToken.id,
    material: processingToken.material,
    stepIndex: job.stepIndex,
    process: step.process,
    machineId: machine.id,
    minutes: step.minutes,
  });
}

function loadedInputTokenIdsForStep(job: Job, step: RecipeStep, machineId: string): number[] | null {
  const used = new Set<number>();
  for (const input of step.inputs) {
    const token = tokenForLoadedInput(job, input, machineId, used);
    if (!token) return null;
    used.add(token.id);
  }
  return [...used];
}

function tokenForLoadedInput(job: Job, input: MaterialType, machineId: string, used: Set<number>): MaterialToken | null {
  if (job.currentMaterial === input && job.currentTokenId !== null && !used.has(job.currentTokenId)) {
    const token = tokens.find((candidate) => candidate.id === job.currentTokenId);
    if (token?.phase === 'loaded' && token.machineId === machineId && token.stepIndex === job.stepIndex) return token;
  }
  return tokens.find((token) => (
    token.jobId === job.id
      && token.stepIndex === job.stepIndex
      && token.material === input
      && token.machineId === machineId
      && token.phase === 'loaded'
      && !used.has(token.id)
  )) ?? null;
}

function advanceProcessingTokens(dtMinutes: number): void {
  for (const token of [...tokens]) {
    if (token.phase !== 'processing') continue;
    token.remainingMinutes -= dtMinutes;
    if (token.remainingMinutes > 0) continue;
    const job = jobsById(token.jobId);
    if (!job) continue;
    const machine = machineLayout.find((candidate) => candidate.id === token.machineId);
    if (machine) machine.tokenId = null;
    const step = recipes[job.product].steps[token.stepIndex];
    debugFactoryPlan('processing finished', {
      jobId: job.id,
      product: job.product,
      tokenId: token.id,
      output: step.output,
      completedStepIndex: token.stepIndex,
      completedProcess: step.process,
      machineId: token.machineId,
      nextStepIndex: job.stepIndex + 1,
    });
    token.material = step.output;
    token.machineId = null;
    token.remainingMinutes = 0;
    job.currentMaterial = step.output;
    job.currentTokenId = token.id;
    job.stepIndex += 1;
    requestPlanSoon();
    const nextStep = recipes[job.product].steps[job.stepIndex];
    if (!nextStep) {
      const route = routeBetween(token, displayPoint);
      if (!route) {
        token.phase = 'waiting';
        lastError = `No conveyor route from ${materialViews[token.material].label} to display.`;
        debugFactoryPlan('finished product stuck: no display route', {
          jobId: job.id,
          product: job.product,
          tokenId: token.id,
          material: token.material,
          x: token.x,
          y: token.y,
        });
        continue;
      }
      token.phase = 'delivering';
      token.route = route;
      token.routeIndex = 0;
      token.plannedRouteIndexLimit = route.length;
      debugFactoryPlan('finished product routed to display', {
        jobId: job.id,
        product: job.product,
        tokenId: token.id,
        material: token.material,
        routeLength: route.length,
      });
      continue;
    }
    token.phase = 'loaded';
    token.stepIndex = job.stepIndex;
    job.status = 'collecting';
    job.loadingMachineId = null;
    job.inputTokenIds = [];
    debugFactoryPlan('WIP ready for next step', {
      jobId: job.id,
      product: job.product,
      tokenId: token.id,
      material: token.material,
      nextStepIndex: job.stepIndex,
      nextProcess: nextStep.process,
      scheduledMachineId: job.stepSchedule[job.stepIndex]?.machineId ?? null,
      tokenPosition: { x: token.x, y: token.y },
    });
    activateCurrentStep(job);
  }
}

function jobsById(id: number): Job | undefined {
  return jobs.find((job) => job.id === id);
}

function fulfillFromStock(): void {
  for (const customer of customers) {
    if (customer.state === 'served') continue;
    while (customer.fulfilled < customer.quantity && finishedStock[customer.product] > 0) {
      finishedStock[customer.product] -= 1;
      customer.fulfilled += 1;
      totalDelivered += 1;
    }
    if (customer.fulfilled >= customer.quantity) {
      customer.state = 'served';
      customer.servedAtMinute = shopMinute;
    }
  }
}

function currentThreadCount(): number {
  const value = Number(workerThreadsInput?.value ?? 1);
  return Number.isFinite(value) ? Math.max(1, Math.min(maxWorkerCount, Math.trunc(value))) : 1;
}

function renderBoard(): void {
  if (!boardEl) return;
  boardEl.innerHTML = '';
  renderedBoardRunning = null;
  cells = buildCells();
  for (const cell of cells) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ['factory-cell', cell.kind, cell.direction ? `dir-${cell.direction}` : '', cell.inactive ? 'inactive' : '']
      .filter(Boolean)
      .join(' ');
    button.style.gridColumn = `${cell.x + 1}`;
    button.style.gridRow = `${cell.y + 1}`;
    button.title = `${cell.label} (${cell.x}, ${cell.y})`;
    if (cell.color) button.style.setProperty('--cell-color', cell.color);
    const face = document.createElement('span');
    face.className = 'cell-face';
    face.textContent = cell.shortLabel ?? '';
    button.append(face);
    boardEl.append(button);
  }
  syncBoardRunningState();
}

function syncBoardRunningState(): void {
  if (renderedBoardRunning === running) return;
  boardEl?.classList.toggle('running', running);
  renderedBoardRunning = running;
}

function renderEntities(): void {
  if (!entityLayerEl) return;
  const machineHtml = machineLayout.filter(isMachineActive).map((machine) => {
    const left = ((machine.x + 0.5) / width) * 100;
    const labelTop = ((machine.y + 0.08) / height) * 100;
    const progressTop = ((machine.y + 0.92) / height) * 100;
    const status = machineStatus(machine);
    const progress = machineProgress(machine);
    return `
      <span class="machine-status" style="left:${left}%; top:${labelTop}%" title="${machine.label}: ${status}">
        <span class="machine-status-text">${status}</span>
      </span>
      <span class="machine-progress machine-progress-under" style="left:${left}%; top:${progressTop}%; --machine-progress:${progress}" title="${machine.label}: ${status}" aria-hidden="true">
        <span></span>
      </span>
    `;
  }).join('');
  const tokenHtml = tokens.map((token) => {
    const view = materialViewForToken(token);
    const left = ((token.x + 0.5) / width) * 100;
    const top = ((token.y + 0.5) / height) * 100;
    const progress = token.phase === 'processing'
      ? Math.max(0, Math.min(1, 1 - token.remainingMinutes / (recipes[jobsById(token.jobId)?.product ?? 'bread'].steps[token.stepIndex]?.minutes ?? 1)))
      : 0;
    const job = jobsById(token.jobId);
    const title = `${view.label} for ${job ? productLabels[job.product] : 'job'} #${token.jobId}`;
    return `
      <span class="batch-token ${token.phase}" data-label="${view.displayLabel}" style="left:${left}%; top:${top}%; --batch-color:${view.color}; --process-progress:${progress}" title="${title}">
        ${view.shortLabel}
      </span>
    `;
  }).join('');
  entityLayerEl.innerHTML = `${machineHtml}${tokenHtml}`;
}

function materialViewForToken(token: MaterialToken): MaterialView {
  if (token.phase === 'processing') return processingViews[token.process];
  return materialViews[token.material];
}

function machineStatus(machine: Machine): string {
  if (jobs.some((job) => job.status === 'loading' && job.loadingMachineId === machine.id)) return 'loading';
  const token = tokens.find((candidate) => candidate.id === machine.tokenId);
  return token?.phase === 'processing' ? 'processing' : processLabels[machine.process];
}

function machineProgress(machine: Machine): number {
  const token = tokens.find((candidate) => candidate.id === machine.tokenId && candidate.phase === 'processing');
  if (!token) return 0;
  const job = jobsById(token.jobId);
  const duration = job ? recipes[job.product].steps[token.stepIndex]?.minutes ?? 1 : 1;
  return Math.max(0, Math.min(1, 1 - token.remainingMinutes / duration));
}

function isMachineCommitted(machine: Machine): boolean {
  if (machine.tokenId !== null) return true;
  if (jobs.some((job) => job.status === 'loading' && job.loadingMachineId === machine.id)) return true;
  return tokens.some((token) => (
    token.machineId === machine.id
      && tokenClaimsMachine(token)
  ));
}

function renderStorefront(): void {
  if (!storefrontEl) return;
  storefrontEl.innerHTML = visibleStorefrontCustomers().map((customer) => {
    const waitingMinutes = Math.max(0, shopMinute - customer.createdAtMinute);
    const remaining = Math.max(0, customer.quantity - customer.fulfilled);
    const servedProgress = customer.state === 'served' && customer.servedAtMinute !== undefined
      ? Math.max(0, Math.min(1, (shopMinute - customer.servedAtMinute) / servedExitMinutes))
      : 0;
    const servedStyle = customer.state === 'served'
      ? `--served-offset: -${Math.round(servedProgress * 42)}px; --served-opacity: ${(1 - servedProgress).toFixed(2)};`
      : '';
    const speech = customer.state === 'served'
      ? `<span class="served-check" aria-hidden="true">&#10003;</span>${productLabels[customer.product]}`
      : `${remaining > 1 ? `${remaining}x ` : ''}${productLabels[customer.product]}`;
    const stateText = customer.state === 'served'
      ? 'served'
      : customer.state === 'walking' ? 'ordering' : formatWait(waitingMinutes);
    return `
      <div class="customer ${customer.state}" style="--customer-color: ${recipes[customer.product].color}; ${servedStyle}" title="${customer.quantity}x ${productLabels[customer.product]}">
        <div class="person">
          <span class="head"></span>
          <span class="body"></span>
        </div>
        <div class="speech">${speech}</div>
        <div class="wait-time">${stateText}</div>
      </div>
    `;
  }).join('');
}

function visibleStorefrontCustomers(): Customer[] {
  const visible = customers.filter((customer) => customer.state !== 'served' || customer.servedAtMinute !== undefined);
  return visible.slice(0, maxWaitingCustomers + 2);
}

function renderOrderPanel(): void {
  if (!orderPanelEl) return;
  const backlog = backlogByProduct();
  const inFlight = inFlightByProduct();
  orderPanelEl.innerHTML = `
    <table>
      <thead><tr><th>Product</th><th>Waiting</th><th>In bakery</th><th>Shelf target</th></tr></thead>
      <tbody>
        ${productTypes.map((product) => `
          <tr>
            <td>${productLabels[product]}</td>
            <td>${formatNumber(backlog[product])}</td>
            <td>${formatNumber(inFlight[product])}</td>
            <td>${shelfTargets[product]}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderMetrics(): void {
  if (!metricsEl) return;
  const backlog = backlogByProduct();
  const totalBacklog = productTypes.reduce((sum, product) => sum + backlog[product], 0);
  renderPlanningBadge();
  metricsEl.innerHTML = `
    <div class="metric"><strong>${activeCustomers().length}/${maxWaitingCustomers}</strong><span>waiting customers</span></div>
    <div class="metric"><strong>${formatNumber(totalBacklog)}</strong><span>open items</span></div>
    <div class="metric"><strong>${jobs.length}/${maxWip}</strong><span>jobs in progress</span></div>
    <div class="metric"><strong>${tokens.length}</strong><span>material tokens</span></div>
    <div class="metric"><strong>${formatNumber(totalDelivered)}</strong><span>delivered total</span></div>
    ${lastError ? `<div class="metric"><strong>Error</strong><span>${lastError}</span></div>` : ''}
  `;
}

function renderPlanningBadge(): void {
  if (!factoryPlanningStatusEl) return;
  if (solving) {
    const label = activeSolveKind === 'partial' ? 'Planning: partial' : activeSolveKind === 'full' ? 'Planning: full' : 'Planning';
    factoryPlanningStatusEl.textContent = label;
    factoryPlanningStatusEl.className = 'planning-badge planning';
    return;
  }
  if (lastError) {
    factoryPlanningStatusEl.textContent = 'Needs attention';
    factoryPlanningStatusEl.className = 'planning-badge error';
    return;
  }
  factoryPlanningStatusEl.textContent = 'Ready';
  factoryPlanningStatusEl.className = 'planning-badge ready';
}

function renderClock(): void {
  if (clockEl) clockEl.textContent = formatClock(shopMinute);
}

function renderPlanDependentViews(): void {
  renderOrderPanel();
  renderMetrics();
}

function renderDynamicViews(): void {
  syncBoardRunningState();
  if (toggleRunningButton) toggleRunningButton.textContent = running ? 'Stop' : 'Start';
  renderClock();
  renderEntities();
  renderStorefront();
  renderMetrics();
}

function frame(now: number): void {
  if (!running) return;
  if (lastFrameTime === 0) lastFrameTime = now;
  const dt = Math.min(0.12, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  simulationStep(dt);
  renderDynamicViews();
  animationFrame = window.requestAnimationFrame(frame);
}

function startSimulation(): void {
  if (running) return;
  running = true;
  lastFrameTime = 0;
  seedOpeningCustomers();
  animationFrame = window.requestAnimationFrame(frame);
  renderDynamicViews();
}

function stopSimulation(): void {
  running = false;
  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
  animationFrame = null;
  renderDynamicViews();
}

function resetSimulation(): void {
  stopSimulation();
  for (const machine of machineLayout) machine.tokenId = null;
  customers = [];
  jobs = [];
  tokens = [];
  finishedStock = zeroProductRecord();
  totalDelivered = 0;
  ingredientStock = { ...initialIngredients };
  customerId = 1;
  jobId = 1;
  tokenId = 1;
  releaseId = 1;
  shopMinute = openingMinute;
  nextOrderAtMinute = openingMinute;
  nextPlanAtMinute = Number.POSITIVE_INFINITY;
  pendingPlanRequest = false;
  solving = false;
  movementPlanStatus = 'Idle';
  renderedBoardRunning = null;
  plan = null;
  planner = null;
  lastError = '';
  if (workerBridgeToggle) workerBridgeToggle.checked = true;
  if (workerThreadsInput) workerThreadsInput.value = String(Math.min(4, maxWorkerCount));
  setWorkerBridgeEnabled(true);
  renderAll();
}

function renderAll(): void {
  renderBoard();
  renderClock();
  renderEntities();
  renderStorefront();
  renderPlanDependentViews();
}

window.__factoryDebug = () => ({
  shopMinute,
  jobs: jobs.map((job) => ({
    id: job.id,
    product: job.product,
    status: job.status,
    stepIndex: job.stepIndex,
    loadingMachineId: job.loadingMachineId,
    scheduledMachineId: job.stepSchedule[job.stepIndex]?.machineId ?? null,
    pendingReleases: job.inputReleases.filter((release) => !release.released).map((release) => ({
      id: release.id,
      input: release.input,
      stepIndex: release.stepIndex,
      machineId: release.machineId,
      plannedDispatchMinute: release.plannedDispatchMinute,
    })),
  })),
  tokens: tokens.map((token) => ({
    id: token.id,
    jobId: token.jobId,
    material: token.material,
    phase: token.phase,
    x: token.x,
    y: token.y,
    routeIndex: token.routeIndex,
    routeLength: token.route.length,
    plannedRouteIndexLimit: token.plannedRouteIndexLimit,
    stepIndex: token.stepIndex,
    machineId: token.machineId,
  })),
  machines: machineLayout.map((machine) => ({
    id: machine.id,
    process: machine.process,
    tokenId: machine.tokenId,
    loadingJobIds: jobs.filter((job) => job.status === 'loading' && job.loadingMachineId === machine.id).map((job) => job.id),
  })),
  lastError,
});

toggleRunningButton?.addEventListener('click', () => {
  if (running) stopSimulation();
  else startSimulation();
});

resetFloorButton?.addEventListener('click', resetSimulation);

workerBridgeToggle?.addEventListener('change', () => {
  setWorkerBridgeEnabled(workerBridgeToggle.checked);
  planner = null;
  requestPlanSoon();
  renderMetrics();
});

workerThreadsInput?.addEventListener('input', () => {
  const clamped = currentThreadCount();
  if (workerThreadsInput) workerThreadsInput.value = String(clamped);
  planner = null;
  requestPlanSoon();
  renderMetrics();
});

renderAll();
