import { initMPSolver, isWorkerBridgeEnabled, MPSolver, type MPVariable } from 'or-tools-wasm';
import { appendStatus, configureWorkerBridge, formatNumber, setRunning } from './mp_solver_helpers.js';

type Nutrient = { name: string; minimum: number };
type Food = { name: string; unit: string; nutrients: number[] };

const nutrients: Nutrient[] = [
  { name: 'Calories (kcal)', minimum: 3 },
  { name: 'Protein (g)', minimum: 70 },
  { name: 'Calcium (g)', minimum: 0.8 },
  { name: 'Iron (mg)', minimum: 12 },
  { name: 'Vitamin A (KIU)', minimum: 5 },
  { name: 'Vitamin B1 (mg)', minimum: 1.8 },
  { name: 'Vitamin B2 (mg)', minimum: 2.7 },
  { name: 'Niacin (mg)', minimum: 18 },
  { name: 'Vitamin C (mg)', minimum: 75 },
];

const data: Food[] = [
  { name: 'Wheat Flour (Enriched)', unit: '10 lb.', nutrients: [44.7, 1411, 2, 365, 0, 55.4, 33.3, 441, 0] },
  { name: 'Macaroni', unit: '1 lb.', nutrients: [11.6, 418, 0.7, 54, 0, 3.2, 1.9, 68, 0] },
  { name: 'Wheat Cereal (Enriched)', unit: '28 oz.', nutrients: [11.8, 377, 14.4, 175, 0, 14.4, 8.8, 114, 0] },
  { name: 'Corn Flakes', unit: '8 oz.', nutrients: [11.4, 252, 0.1, 56, 0, 13.5, 2.3, 68, 0] },
  { name: 'Corn Meal', unit: '1 lb.', nutrients: [36, 897, 1.7, 99, 30.9, 17.4, 7.9, 106, 0] },
  { name: 'Hominy Grits', unit: '24 oz.', nutrients: [28.6, 680, 0.8, 80, 0, 10.6, 1.6, 110, 0] },
  { name: 'Rice', unit: '1 lb.', nutrients: [21.2, 460, 0.6, 41, 0, 2, 4.8, 60, 0] },
  { name: 'Rolled Oats', unit: '1 lb.', nutrients: [25.3, 907, 5.1, 341, 0, 37.1, 8.9, 64, 0] },
  { name: 'White Bread (Enriched)', unit: '1 lb.', nutrients: [15, 488, 2.5, 115, 0, 13.8, 8.5, 126, 0] },
  { name: 'Whole Wheat Bread', unit: '1 lb.', nutrients: [12.2, 484, 2.7, 125, 0, 13.9, 6.4, 160, 0] },
  { name: 'Rye Bread', unit: '1 lb.', nutrients: [12.4, 439, 1.1, 82, 0, 9.9, 3, 66, 0] },
  { name: 'Pound Cake', unit: '1 lb.', nutrients: [8, 130, 0.4, 31, 18.9, 2.8, 3, 17, 0] },
  { name: 'Soda Crackers', unit: '1 lb.', nutrients: [12.5, 288, 0.5, 50, 0, 0, 0, 0, 0] },
  { name: 'Milk', unit: '1 qt.', nutrients: [6.1, 310, 10.5, 18, 16.8, 4, 16, 7, 177] },
  { name: 'Evaporated Milk (can)', unit: '14.5 oz.', nutrients: [8.4, 422, 15.1, 9, 26, 3, 23.5, 11, 60] },
  { name: 'Butter', unit: '1 lb.', nutrients: [10.8, 9, 0.2, 3, 44.2, 0, 0.2, 2, 0] },
  { name: 'Oleomargarine', unit: '1 lb.', nutrients: [20.6, 17, 0.6, 6, 55.8, 0.2, 0, 0, 0] },
  { name: 'Eggs', unit: '1 doz.', nutrients: [2.9, 238, 1, 52, 18.6, 2.8, 6.5, 1, 0] },
  { name: 'Cheese (Cheddar)', unit: '1 lb.', nutrients: [7.4, 448, 16.4, 19, 28.1, 0.8, 10.3, 4, 0] },
  { name: 'Cream', unit: '1/2 pt.', nutrients: [3.5, 49, 1.7, 3, 16.9, 0.6, 2.5, 0, 17] },
  { name: 'Peanut Butter', unit: '1 lb.', nutrients: [15.7, 661, 1, 48, 0, 9.6, 8.1, 471, 0] },
  { name: 'Mayonnaise', unit: '1/2 pt.', nutrients: [8.6, 18, 0.2, 8, 2.7, 0.4, 0.5, 0, 0] },
  { name: 'Crisco', unit: '1 lb.', nutrients: [20.1, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Lard', unit: '1 lb.', nutrients: [41.7, 0, 0, 0, 0.2, 0, 0.5, 5, 0] },
  { name: 'Sirloin Steak', unit: '1 lb.', nutrients: [2.9, 166, 0.1, 34, 0.2, 2.1, 2.9, 69, 0] },
  { name: 'Round Steak', unit: '1 lb.', nutrients: [2.2, 214, 0.1, 32, 0.4, 2.5, 2.4, 87, 0] },
  { name: 'Rib Roast', unit: '1 lb.', nutrients: [3.4, 213, 0.1, 33, 0, 0, 2, 0, 0] },
  { name: 'Chuck Roast', unit: '1 lb.', nutrients: [3.6, 309, 0.2, 46, 0.4, 1, 4, 120, 0] },
  { name: 'Plate', unit: '1 lb.', nutrients: [8.5, 404, 0.2, 62, 0, 0.9, 0, 0, 0] },
  { name: 'Liver (Beef)', unit: '1 lb.', nutrients: [2.2, 333, 0.2, 139, 169.2, 6.4, 50.8, 316, 525] },
  { name: 'Leg of Lamb', unit: '1 lb.', nutrients: [3.1, 245, 0.1, 20, 0, 2.8, 3.9, 86, 0] },
  { name: 'Lamb Chops (Rib)', unit: '1 lb.', nutrients: [3.3, 140, 0.1, 15, 0, 1.7, 2.7, 54, 0] },
  { name: 'Pork Chops', unit: '1 lb.', nutrients: [3.5, 196, 0.2, 30, 0, 17.4, 2.7, 60, 0] },
  { name: 'Pork Loin Roast', unit: '1 lb.', nutrients: [4.4, 249, 0.3, 37, 0, 18.2, 3.6, 79, 0] },
  { name: 'Bacon', unit: '1 lb.', nutrients: [10.4, 152, 0.2, 23, 0, 1.8, 1.8, 71, 0] },
  { name: 'Ham, smoked', unit: '1 lb.', nutrients: [6.7, 212, 0.2, 31, 0, 9.9, 3.3, 50, 0] },
  { name: 'Salt Pork', unit: '1 lb.', nutrients: [18.8, 164, 0.1, 26, 0, 1.4, 1.8, 0, 0] },
  { name: 'Roasting Chicken', unit: '1 lb.', nutrients: [1.8, 184, 0.1, 30, 0.1, 0.9, 1.8, 68, 46] },
  { name: 'Veal Cutlets', unit: '1 lb.', nutrients: [1.7, 156, 0.1, 24, 0, 1.4, 2.4, 57, 0] },
  { name: 'Salmon, Pink (can)', unit: '16 oz.', nutrients: [5.8, 705, 6.8, 45, 3.5, 1, 4.9, 209, 0] },
  { name: 'Apples', unit: '1 lb.', nutrients: [5.8, 27, 0.5, 36, 7.3, 3.6, 2.7, 5, 544] },
  { name: 'Bananas', unit: '1 lb.', nutrients: [4.9, 60, 0.4, 30, 17.4, 2.5, 3.5, 28, 498] },
  { name: 'Lemons', unit: '1 doz.', nutrients: [1, 21, 0.5, 14, 0, 0.5, 0, 4, 952] },
  { name: 'Oranges', unit: '1 doz.', nutrients: [2.2, 40, 1.1, 18, 11.1, 3.6, 1.3, 10, 1998] },
  { name: 'Green Beans', unit: '1 lb.', nutrients: [2.4, 138, 3.7, 80, 69, 4.3, 5.8, 37, 862] },
  { name: 'Cabbage', unit: '1 lb.', nutrients: [2.6, 125, 4, 36, 7.2, 9, 4.5, 26, 5369] },
  { name: 'Carrots', unit: '1 bunch', nutrients: [2.7, 73, 2.8, 43, 188.5, 6.1, 4.3, 89, 608] },
  { name: 'Celery', unit: '1 stalk', nutrients: [0.9, 51, 3, 23, 0.9, 1.4, 1.4, 9, 313] },
  { name: 'Lettuce', unit: '1 head', nutrients: [0.4, 27, 1.1, 22, 112.4, 1.8, 3.4, 11, 449] },
  { name: 'Onions', unit: '1 lb.', nutrients: [5.8, 166, 3.8, 59, 16.6, 4.7, 5.9, 21, 1184] },
  { name: 'Potatoes', unit: '15 lb.', nutrients: [14.3, 336, 1.8, 118, 6.7, 29.4, 7.1, 198, 2522] },
  { name: 'Spinach', unit: '1 lb.', nutrients: [1.1, 106, 0, 138, 918.4, 5.7, 13.8, 33, 2755] },
  { name: 'Sweet Potatoes', unit: '1 lb.', nutrients: [9.6, 138, 2.7, 54, 290.7, 8.4, 5.4, 83, 1912] },
  { name: 'Peaches (can)', unit: 'No. 2 1/2', nutrients: [3.7, 20, 0.4, 10, 21.5, 0.5, 1, 31, 196] },
  { name: 'Pears (can)', unit: 'No. 2 1/2', nutrients: [3, 8, 0.3, 8, 0.8, 0.8, 0.8, 5, 81] },
  { name: 'Pineapple (can)', unit: 'No. 2 1/2', nutrients: [2.4, 16, 0.4, 8, 2, 2.8, 0.8, 7, 399] },
  { name: 'Asparagus (can)', unit: 'No. 2', nutrients: [0.4, 33, 0.3, 12, 16.3, 1.4, 2.1, 17, 272] },
  { name: 'Green Beans (can)', unit: 'No. 2', nutrients: [1, 54, 2, 65, 53.9, 1.6, 4.3, 32, 431] },
  { name: 'Pork and Beans (can)', unit: '16 oz.', nutrients: [7.5, 364, 4, 134, 3.5, 8.3, 7.7, 56, 0] },
  { name: 'Corn (can)', unit: 'No. 2', nutrients: [5.2, 136, 0.2, 16, 12, 1.6, 2.7, 42, 218] },
  { name: 'Peas (can)', unit: 'No. 2', nutrients: [2.3, 136, 0.6, 45, 34.9, 4.9, 2.5, 37, 370] },
  { name: 'Tomatoes (can)', unit: 'No. 2', nutrients: [1.3, 63, 0.7, 38, 53.2, 3.4, 2.5, 36, 1253] },
  { name: 'Tomato Soup (can)', unit: '10 1/2 oz.', nutrients: [1.6, 71, 0.6, 43, 57.9, 3.5, 2.4, 67, 862] },
  { name: 'Peaches, Dried', unit: '1 lb.', nutrients: [8.5, 87, 1.7, 173, 86.8, 1.2, 4.3, 55, 57] },
  { name: 'Prunes, Dried', unit: '1 lb.', nutrients: [12.8, 99, 2.5, 154, 85.7, 3.9, 4.3, 65, 257] },
  { name: 'Raisins, Dried', unit: '15 oz.', nutrients: [13.5, 104, 2.5, 136, 4.5, 6.3, 1.4, 24, 136] },
  { name: 'Peas, Dried', unit: '1 lb.', nutrients: [20, 1367, 4.2, 345, 2.9, 28.7, 18.4, 162, 0] },
  { name: 'Lima Beans, Dried', unit: '1 lb.', nutrients: [17.4, 1055, 3.7, 459, 5.1, 26.9, 38.2, 93, 0] },
  { name: 'Navy Beans, Dried', unit: '1 lb.', nutrients: [26.9, 1691, 11.4, 792, 0, 38.4, 24.6, 217, 0] },
  { name: 'Coffee', unit: '1 lb.', nutrients: [0, 0, 0, 0, 0, 4, 5.1, 50, 0] },
  { name: 'Tea', unit: '1/4 lb.', nutrients: [0, 0, 0, 0, 0, 0, 2.3, 42, 0] },
  { name: 'Cocoa', unit: '8 oz.', nutrients: [8.7, 237, 3, 72, 0, 2, 11.9, 40, 0] },
  { name: 'Chocolate', unit: '8 oz.', nutrients: [8, 77, 1.3, 39, 0, 0.9, 3.4, 14, 0] },
  { name: 'Sugar', unit: '10 lb.', nutrients: [34.9, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Corn Syrup', unit: '24 oz.', nutrients: [14.7, 0, 0.5, 74, 0, 0, 0, 5, 0] },
  { name: 'Molasses', unit: '18 oz.', nutrients: [9, 0, 10.3, 244, 0, 1.9, 7.5, 146, 0] },
  { name: 'Strawberry Preserves', unit: '1 lb.', nutrients: [6.4, 11, 0.4, 7, 0.2, 0.2, 0.4, 3, 0] },
];

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const solverId = document.body.dataset.solverId === 'CLP' ? 'CLP' : 'GLOP';

configureWorkerBridge(workerBridgeToggle);

function renderDietResult(
  annualCost: number,
  selectedFoods: Array<{ food: Food; dailyUnits: number }>,
  nutrientTotals: number[],
  wallTime: number,
  iterations: number,
) {
  if (!solutionOutput) return;
  solutionOutput.innerHTML = `
    <table>
      <tbody>
        <tr><th>Annual cost</th><td>$${formatNumber(annualCost)}</td></tr>
        <tr><th>Worker bridge</th><td>${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}</td></tr>
        <tr><th>Solver workers</th><td>1</td></tr>
        <tr><th>Selected foods</th><td>${selectedFoods.length}</td></tr>
        <tr><th>Wall time</th><td>${wallTime} ms</td></tr>
        <tr><th>Iterations</th><td>${iterations}</td></tr>
      </tbody>
    </table>
    <h2>Annual Foods</h2>
    <table>
      <thead><tr><th>Food</th><th>Unit</th><th>Annual spend</th></tr></thead>
      <tbody>
        ${selectedFoods.map(({ food, dailyUnits }) => `<tr><td>${food.name}</td><td>${food.unit}</td><td>$${formatNumber(365 * dailyUnits)}</td></tr>`).join('')}
      </tbody>
    </table>
    <h2>Nutrients Per Day</h2>
    <table>
      <thead><tr><th>Nutrient</th><th>Minimum</th><th>Result</th></tr></thead>
      <tbody>
        ${nutrients.map((nutrient, index) => `<tr><td>${nutrient.name}</td><td>${formatNumber(nutrient.minimum)}</td><td>${formatNumber(nutrientTotals[index])}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}

async function runStiglerDiet() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    await initMPSolver();
    const solver = MPSolver.CreateSolver(solverId);
    if (!solver) throw new Error(`${solverId} is unavailable in this build.`);
    try {
      const foods: MPVariable[] = data.map((food) => solver.NumVar(0, solver.infinity(), food.name));
      for (const [nutrientIndex, nutrient] of nutrients.entries()) {
        const constraint = solver.Constraint(nutrient.minimum, solver.infinity(), nutrient.name);
        for (const [foodIndex, food] of data.entries()) {
          constraint.SetCoefficient(foods[foodIndex], food.nutrients[nutrientIndex]);
        }
      }

      const objective = solver.Objective();
      for (const food of foods) {
        objective.SetCoefficient(food, 1);
      }
      objective.SetMinimization();

      appendStatus(statusEl, `Solving with ${solver.SolverVersion()}...`);
      const status = await solver.Solve();
      if (status !== MPSolver.OPTIMAL) throw new Error(`expected OPTIMAL, got ${status}`);

      const nutrientTotals = Array.from({ length: nutrients.length }, () => 0);
      const selectedFoods: Array<{ food: Food; dailyUnits: number }> = [];
      for (const [foodIndex, variable] of foods.entries()) {
        const dailyUnits = variable.solution_value();
        if (dailyUnits > 1e-8) {
          selectedFoods.push({ food: data[foodIndex], dailyUnits });
          for (const nutrientIndex of nutrients.keys()) {
            nutrientTotals[nutrientIndex] += data[foodIndex].nutrients[nutrientIndex] * dailyUnits;
          }
        }
      }

      renderDietResult(365 * objective.Value(), selectedFoods, nutrientTotals, solver.WallTime(), solver.Iterations());
      appendStatus(statusEl, `Objective: $${formatNumber(365 * objective.Value())} annual cost`);
      appendStatus(statusEl, `Variables: ${solver.NumVariables()}`);
      appendStatus(statusEl, `Constraints: ${solver.NumConstraints()}`);
      appendStatus(statusEl, `Iterations: ${solver.Iterations()}`);
    } finally {
      solver.delete();
    }
  } catch (error) {
    appendStatus(statusEl, `Solve failed: ${(error as Error).message}`);
  } finally {
    setRunning(runButton, false);
  }
}

runButton?.addEventListener('click', () => {
  void runStiglerDiet();
});
