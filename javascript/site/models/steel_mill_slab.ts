export type SolverMethod = 'sat' | 'sat_table' | 'sat_column';

type Order = {
  width: number;
  color: number;
};

export type ProblemData = {
  id: number;
  numSlabs: number;
  capacities: number[];
  numColors: number;
  orders: Order[];
};

export const PROBLEMS: ProblemData[] = [
  {
    id: 0,
    numSlabs: 111,
    capacities: [
      0, 12, 14, 17, 18, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 32, 35, 39, 42, 43, 44,
    ],
    numColors: 88,
    orders: [
      { width: 4, color: 1 },
      { width: 22, color: 2 },
      { width: 9, color: 3 },
      { width: 5, color: 4 },
      { width: 8, color: 5 },
      { width: 3, color: 6 },
      { width: 3, color: 4 },
      { width: 4, color: 7 },
      { width: 7, color: 4 },
      { width: 7, color: 8 },
      { width: 3, color: 6 },
      { width: 2, color: 6 },
      { width: 2, color: 4 },
      { width: 8, color: 9 },
      { width: 5, color: 10 },
      { width: 7, color: 11 },
      { width: 4, color: 7 },
      { width: 7, color: 11 },
      { width: 5, color: 10 },
      { width: 7, color: 11 },
      { width: 8, color: 9 },
      { width: 3, color: 1 },
      { width: 25, color: 12 },
      { width: 14, color: 13 },
      { width: 3, color: 6 },
      { width: 22, color: 14 },
      { width: 19, color: 15 },
      { width: 19, color: 15 },
      { width: 22, color: 16 },
      { width: 22, color: 17 },
      { width: 22, color: 18 },
      { width: 20, color: 19 },
      { width: 22, color: 20 },
      { width: 5, color: 21 },
      { width: 4, color: 22 },
      { width: 10, color: 23 },
      { width: 26, color: 24 },
      { width: 17, color: 25 },
      { width: 20, color: 26 },
      { width: 16, color: 27 },
      { width: 10, color: 28 },
      { width: 19, color: 29 },
      { width: 10, color: 30 },
      { width: 10, color: 31 },
      { width: 23, color: 32 },
      { width: 22, color: 33 },
      { width: 26, color: 34 },
      { width: 27, color: 35 },
      { width: 22, color: 36 },
      { width: 27, color: 37 },
      { width: 22, color: 38 },
      { width: 22, color: 39 },
      { width: 13, color: 40 },
      { width: 14, color: 41 },
      { width: 16, color: 27 },
      { width: 26, color: 34 },
      { width: 26, color: 42 },
      { width: 27, color: 35 },
      { width: 22, color: 36 },
      { width: 20, color: 43 },
      { width: 26, color: 24 },
      { width: 22, color: 44 },
      { width: 13, color: 45 },
      { width: 19, color: 46 },
      { width: 20, color: 47 },
      { width: 16, color: 48 },
      { width: 15, color: 49 },
      { width: 17, color: 50 },
      { width: 10, color: 28 },
      { width: 20, color: 51 },
      { width: 5, color: 52 },
      { width: 26, color: 24 },
      { width: 19, color: 53 },
      { width: 15, color: 54 },
      { width: 10, color: 55 },
      { width: 10, color: 56 },
      { width: 13, color: 57 },
      { width: 13, color: 58 },
      { width: 13, color: 59 },
      { width: 12, color: 60 },
      { width: 12, color: 61 },
      { width: 18, color: 62 },
      { width: 10, color: 63 },
      { width: 18, color: 64 },
      { width: 16, color: 65 },
      { width: 20, color: 66 },
      { width: 12, color: 67 },
      { width: 6, color: 68 },
      { width: 6, color: 68 },
      { width: 15, color: 69 },
      { width: 15, color: 70 },
      { width: 15, color: 70 },
      { width: 21, color: 71 },
      { width: 30, color: 72 },
      { width: 30, color: 73 },
      { width: 30, color: 74 },
      { width: 30, color: 75 },
      { width: 23, color: 76 },
      { width: 15, color: 77 },
      { width: 15, color: 78 },
      { width: 27, color: 79 },
      { width: 27, color: 80 },
      { width: 27, color: 81 },
      { width: 27, color: 82 },
      { width: 27, color: 83 },
      { width: 27, color: 84 },
      { width: 27, color: 79 },
      { width: 27, color: 85 },
      { width: 27, color: 86 },
      { width: 10, color: 87 },
      { width: 3, color: 88 },
    ],
  },
  {
    id: 1,
    numSlabs: 30,
    capacities: [0, 17, 44],
    numColors: 23,
    orders: [
      { width: 4, color: 1 },
      { width: 22, color: 2 },
      { width: 9, color: 3 },
      { width: 5, color: 4 },
      { width: 8, color: 5 },
      { width: 3, color: 6 },
      { width: 3, color: 4 },
      { width: 4, color: 7 },
      { width: 7, color: 4 },
      { width: 7, color: 8 },
      { width: 3, color: 6 },
      { width: 2, color: 6 },
      { width: 2, color: 4 },
      { width: 8, color: 9 },
      { width: 5, color: 10 },
      { width: 7, color: 11 },
      { width: 4, color: 7 },
      { width: 7, color: 11 },
      { width: 5, color: 10 },
      { width: 7, color: 11 },
      { width: 8, color: 9 },
      { width: 3, color: 1 },
      { width: 25, color: 12 },
      { width: 14, color: 13 },
      { width: 3, color: 6 },
      { width: 22, color: 14 },
      { width: 19, color: 15 },
      { width: 19, color: 15 },
      { width: 22, color: 16 },
      { width: 22, color: 17 },
      { width: 22, color: 18 },
      { width: 20, color: 19 },
      { width: 22, color: 20 },
      { width: 5, color: 21 },
      { width: 4, color: 22 },
      { width: 10, color: 23 },
    ],
  },
  {
    id: 2,
    numSlabs: 20,
    capacities: [0, 17, 44],
    numColors: 15,
    orders: [
      { width: 4, color: 1 },
      { width: 22, color: 2 },
      { width: 9, color: 3 },
      { width: 5, color: 4 },
      { width: 8, color: 5 },
      { width: 3, color: 6 },
      { width: 3, color: 4 },
      { width: 4, color: 7 },
      { width: 7, color: 4 },
      { width: 7, color: 8 },
      { width: 3, color: 6 },
      { width: 2, color: 6 },
      { width: 2, color: 4 },
      { width: 8, color: 9 },
      { width: 5, color: 10 },
      { width: 7, color: 11 },
      { width: 4, color: 7 },
      { width: 7, color: 11 },
      { width: 5, color: 10 },
      { width: 7, color: 11 },
      { width: 8, color: 9 },
      { width: 3, color: 1 },
      { width: 25, color: 12 },
      { width: 14, color: 13 },
      { width: 3, color: 6 },
      { width: 22, color: 14 },
      { width: 19, color: 15 },
      { width: 19, color: 15 },
    ],
  },
  {
    id: 3,
    numSlabs: 10,
    capacities: [0, 17, 44],
    numColors: 8,
    orders: [
      { width: 4, color: 1 },
      { width: 22, color: 2 },
      { width: 9, color: 3 },
      { width: 5, color: 4 },
      { width: 8, color: 5 },
      { width: 3, color: 6 },
      { width: 3, color: 4 },
      { width: 4, color: 7 },
      { width: 7, color: 4 },
      { width: 7, color: 8 },
      { width: 3, color: 6 },
    ],
  },
];

type CpModelInput = {
  name: string;
  variables: Array<{ name?: string; domain: [number, number] }>;
  constraints: Array<
    | {
      name?: string;
      linear: { vars: number[]; coeffs: number[]; domain: [number, number] };
    }
    | { name?: string; table: { vars: number[]; values: number[] } }
  >;
  objective?: {
    vars: number[];
    coeffs: number[];
    offset?: number;
    scaling_factor?: number;
  };
};

type ValidSlab = {
  assignment: number[];
  loss: number;
  load: number;
};

export type ModelMetadata = {
  solver: SolverMethod;
  problem: ProblemData;
  assignByOrder?: number[][];
  loadIndices?: number[];
  lossIndices?: number[];
  colorIndices?: number[][];
  selectedIndices?: number[];
  validSlabs?: ValidSlab[];
};

type ModelBundle = {
  model: CpModelInput;
  metadata: ModelMetadata;
};

export const buildProblem = (problemId: number): ProblemData => {
  const problem = PROBLEMS.find((p) => p.id === problemId);
  if (problem) return problem;
  return PROBLEMS[PROBLEMS.length - 1];
};

const computeLossArray = (capacities: number[]): number[] => {
  const maxCapacity = Math.max(...capacities);
  const lossArray: number[] = [];
  for (let load = 0; load <= maxCapacity; ++load) {
    const value = capacities.find((capacity) => capacity >= load) ?? maxCapacity;
    lossArray[load] = value - load;
  }
  return lossArray;
};

const collectValidSlabs = (
  capacities: number[],
  widths: number[],
  colors: number[],
  lossArray: number[],
): ValidSlab[] => {
  const maxCapacity = Math.max(...capacities);
  type PartialAssignment = {
    orders: number[];
    load: number;
    colors: Set<number>;
  };

  const allAssignments: PartialAssignment[] = [{ orders: [], load: 0, colors: new Set() }];
  for (let orderId = 0; orderId < widths.length; ++orderId) {
    const newAssignments: PartialAssignment[] = [];
    const orderWidth = widths[orderId];
    const orderColor = colors[orderId];
    for (const assignment of allAssignments) {
      if (assignment.load + orderWidth > maxCapacity) {
        continue;
      }
      const assignmentColors = new Set(assignment.colors);
      assignmentColors.add(orderColor);
      if (assignmentColors.size > 2) {
        continue;
      }
      newAssignments.push({
        orders: [...assignment.orders, orderId],
        load: assignment.load + orderWidth,
        colors: assignmentColors,
      });
    }
    allAssignments.push(...newAssignments);
  }

  return allAssignments.map((assignment) => {
    const vector = new Array(widths.length).fill(0);
    assignment.orders.forEach((order) => (vector[order] = 1));
    return {
      assignment: vector,
      loss: lossArray[assignment.load],
      load: assignment.load,
    };
  });
};

const buildSatModel = (
  problem: ProblemData,
  lossArray: number[],
  breakSymmetries: boolean,
): ModelBundle => {
  const { numSlabs, numColors, orders } = problem;
  const widths = orders.map((order) => order.width);
  const colors = orders.map((order) => order.color);
  const totalLoad = widths.reduce((sum, value) => sum + value, 0);
  const maxCapacity = Math.max(...problem.capacities);
  const maxLoss = Math.max(...lossArray);

  const variables: CpModelInput['variables'] = [];
  const constraints: CpModelInput['constraints'] = [];
  const addVar = (name: string, domain: [number, number]) => {
    const idx = variables.length;
    variables.push({ name, domain });
    return idx;
  };

  const assignByOrder: number[][] = [];
  for (let orderId = 0; orderId < orders.length; ++orderId) {
    const slabVars: number[] = [];
    for (let slabId = 0; slabId < numSlabs; ++slabId) {
      slabVars.push(addVar(`assign_${orderId}_slab_${slabId}`, [0, 1]));
    }
    assignByOrder.push(slabVars);
  }

  const loadIndices = Array.from({ length: numSlabs }, (_, slabId) =>
    addVar(`load_${slabId}`, [0, maxCapacity]),
  );
  const lossIndices = Array.from({ length: numSlabs }, (_, slabId) =>
    addVar(`loss_${slabId}`, [0, maxLoss]),
  );
  const colorIndices = Array.from({ length: numSlabs }, () =>
    Array.from({ length: numColors }, (_, colorId) => addVar(`color_${colorId + 1}`, [0, 1])),
  );

  const loadLossTuples: number[][] = [];
  for (let load = 0; load <= maxCapacity; ++load) {
    loadLossTuples.push([load, lossArray[load]]);
  }
  const loadLossValues = loadLossTuples.flat();

  for (let slabId = 0; slabId < numSlabs; ++slabId) {
    const assignVars = assignByOrder.map((orderVars) => orderVars[slabId]);
    constraints.push({
      name: `load_balance_slab_${slabId}`,
      linear: {
        vars: [...assignVars, loadIndices[slabId]],
        coeffs: [
          ...widths,
          -1,
        ],
        domain: [0, 0],
      },
    });

    constraints.push({
      name: `loss_mapping_slab_${slabId}`,
      table: {
        vars: [loadIndices[slabId], lossIndices[slabId]],
        values: loadLossValues,
      },
    });
  }

  for (let orderId = 0; orderId < orders.length; ++orderId) {
    constraints.push({
      name: `assign_once_order_${orderId}`,
      linear: {
        vars: assignByOrder[orderId],
        coeffs: Array(numSlabs).fill(1),
        domain: [1, 1],
      },
    });
  }

  constraints.push({
    name: 'total_load',
    linear: {
      vars: loadIndices,
      coeffs: Array(loadIndices.length).fill(1),
      domain: [totalLoad, totalLoad],
    },
  });

  const ordersPerColor = Array.from({ length: numColors }, () => [] as number[]);
  colors.forEach((color, orderId) => {
    if (color > 0 && color <= numColors) {
      ordersPerColor[color - 1].push(orderId);
    }
  });

  for (let slabId = 0; slabId < numSlabs; ++slabId) {
    for (let colorId = 0; colorId < numColors; ++colorId) {
      const assignVars = ordersPerColor[colorId].map(
        (orderId) => assignByOrder[orderId][slabId],
      );
      constraints.push({
        name: `color_link_slab_${slabId}_color_${colorId + 1}`,
        linear: {
          vars: [colorIndices[slabId][colorId], ...assignVars],
          coeffs: [1, ...assignVars.map(() => -1)],
          domain: [-assignVars.length, 0],
        },
      });
      // The indicator is true exactly when at least one order uses this color.
      constraints.push({
        name: `color_present_slab_${slabId}_color_${colorId + 1}`,
        linear: {
          vars: [colorIndices[slabId][colorId], ...assignVars],
          coeffs: [assignVars.length, ...assignVars.map(() => -1)],
          domain: [0, assignVars.length],
        },
      });
    }
  }

  for (let slabId = 0; slabId < numSlabs; ++slabId) {
    constraints.push({
      name: `max_two_colors_slab_${slabId}`,
      linear: {
        vars: colorIndices[slabId],
        coeffs: Array(colorIndices[slabId].length).fill(1),
        domain: [0, 2],
      },
    });
  }

  const uniqueColorOrders = ordersPerColor
    .map((orders) => (orders.length === 1 ? orders[0] : -1))
    .filter((orderId) => orderId >= 0);
  if (uniqueColorOrders.length) {
    for (let slabId = 0; slabId < numSlabs; ++slabId) {
      constraints.push({
        name: `unique_color_project_slab_${slabId}`,
        linear: {
          vars: uniqueColorOrders.map((orderId) => assignByOrder[orderId][slabId]),
          coeffs: Array(uniqueColorOrders.length).fill(1),
          domain: [0, 2],
        },
      });
    }
  }

  for (let slabId = 0; slabId < numSlabs - 1; ++slabId) {
    constraints.push({
      name: `load_order_slab_${slabId}`,
      linear: {
        vars: [loadIndices[slabId], loadIndices[slabId + 1]],
        coeffs: [1, -1],
        domain: [0, maxCapacity],
      },
    });
  }

  const widthToUniqueColorOrder = new Map<number, number[]>();
  const orderedEquivalentOrders: [number, number][] = [];
  for (const colorOrders of ordersPerColor) {
    if (!colorOrders.length) {
      continue;
    }
    if (colorOrders.length === 1) {
      const order = colorOrders[0];
      const width = widths[order];
      const entries = widthToUniqueColorOrder.get(width) ?? [];
      entries.push(order);
      widthToUniqueColorOrder.set(width, entries);
      continue;
    }
    const localMap = new Map<number, number[]>();
    for (const order of colorOrders) {
      const width = widths[order];
      const ordersForWidth = localMap.get(width) ?? [];
      ordersForWidth.push(order);
      localMap.set(width, ordersForWidth);
    }
    for (const ordersGroup of localMap.values()) {
      if (ordersGroup.length <= 1) continue;
      for (let idx = 0; idx < ordersGroup.length - 1; ++idx) {
        orderedEquivalentOrders.push([ordersGroup[idx], ordersGroup[idx + 1]]);
      }
    }
  }
  for (const ordersGroup of widthToUniqueColorOrder.values()) {
    if (ordersGroup.length <= 1) continue;
    for (let idx = 0; idx < ordersGroup.length - 1; ++idx) {
      orderedEquivalentOrders.push([ordersGroup[idx], ordersGroup[idx + 1]]);
    }
  }

  const positionIndices = new Map<number, number>();
  if (breakSymmetries && orderedEquivalentOrders.length) {
    for (const [first, second] of orderedEquivalentOrders) {
      if (!positionIndices.has(first)) {
        positionIndices.set(first, addVar(`position_${first}`, [0, numSlabs - 1]));
      }
      if (!positionIndices.has(second)) {
        positionIndices.set(second, addVar(`position_${second}`, [0, numSlabs - 1]));
      }
      const firstPosition = positionIndices.get(first)!;
      const secondPosition = positionIndices.get(second)!;

      const firstAssignVars = assignByOrder[first];
      const firstCoeffs = firstAssignVars.map((_, slabId) => slabId);
      constraints.push({
        name: `position_map_${first}`,
        linear: {
          vars: [...firstAssignVars, firstPosition],
          coeffs: [...firstCoeffs, -1],
          domain: [0, 0],
        },
      });

      const secondAssignVars = assignByOrder[second];
      const secondCoeffs = secondAssignVars.map((_, slabId) => slabId);
      constraints.push({
        name: `position_map_${second}`,
        linear: {
          vars: [...secondAssignVars, secondPosition],
          coeffs: [...secondCoeffs, -1],
          domain: [0, 0],
        },
      });

      constraints.push({
        name: `symmetry_${first}_${second}`,
        linear: {
          vars: [firstPosition, secondPosition],
          coeffs: [1, -1],
          domain: [-(numSlabs - 1), 0],
        },
      });
    }
  }

  const model: CpModelInput = {
    name: 'steel_mill_slab_sat',
    variables,
    constraints,
    objective: {
      vars: lossIndices,
      coeffs: Array(lossIndices.length).fill(1),
    },
  };

  const metadata: ModelMetadata = {
    solver: 'sat',
    problem,
    assignByOrder,
    loadIndices,
    lossIndices,
    colorIndices,
  };

  return { model, metadata };
};

const buildSatTableModel = (
  problem: ProblemData,
  lossArray: number[],
  breakSymmetries: boolean,
): ModelBundle => {
  const base = buildSatModel(problem, lossArray, breakSymmetries);
  const { metadata, model } = base;
  if (metadata.solver !== 'sat') {
    return base;
  }

  const validSlabs = collectValidSlabs(
    problem.capacities,
    problem.orders.map((order) => order.width),
    problem.orders.map((order) => order.color),
    lossArray,
  );
  const slabTuples = validSlabs.map((slab) => [
    ...slab.assignment,
    slab.loss,
    slab.load,
  ]);
  const tableValues = slabTuples.flat();

  for (let slabId = 0; slabId < problem.numSlabs; ++slabId) {
    const assignVars = metadata.assignByOrder!.map((vars) => vars[slabId]);
    model.constraints.push({
      name: `valid_slab_${slabId}`,
      table: {
        vars: [...assignVars, metadata.lossIndices![slabId], metadata.loadIndices![slabId]],
        values: tableValues,
      },
    });
  }

  metadata.solver = 'sat_table';
  metadata.validSlabs = validSlabs;
  return { model, metadata };
};

const buildColumnModel = (
  problem: ProblemData,
  lossArray: number[],
): ModelBundle => {
  const widths = problem.orders.map((order) => order.width);
  const totalLoad = widths.reduce((sum, value) => sum + value, 0);
  const validSlabs = collectValidSlabs(
    problem.capacities,
    widths,
    problem.orders.map((order) => order.color),
    lossArray,
  );

  const variables: CpModelInput['variables'] = [];
  const constraints: CpModelInput['constraints'] = [];
  const addVar = (name: string, domain: [number, number]) => {
    const idx = variables.length;
    variables.push({ name, domain });
    return idx;
  };

  const selectedIndices = validSlabs.map((_, idx) =>
    addVar(`column_selected_${idx}`, [0, 1]),
  );

  for (let orderId = 0; orderId < problem.orders.length; ++orderId) {
    const involvedColumns = validSlabs
      .map((slab, columnId) => (slab.assignment[orderId] === 1 ? columnId : -1))
      .filter((col) => col >= 0);
    if (!involvedColumns.length) continue;
    constraints.push({
      name: `order_cover_${orderId}`,
      linear: {
        vars: involvedColumns.map((columnId) => selectedIndices[columnId]),
        coeffs: Array(involvedColumns.length).fill(1),
        domain: [1, 1],
      },
    });
  }

  constraints.push({
    name: 'total_load',
    linear: {
      vars: selectedIndices,
      coeffs: validSlabs.map((slab) => slab.load),
      domain: [totalLoad, totalLoad],
    },
  });

  const model: CpModelInput = {
    name: 'steel_mill_slab_column',
    variables,
    constraints,
    objective: {
      vars: selectedIndices,
      coeffs: validSlabs.map((slab) => slab.loss),
    },
  };

  const metadata: ModelMetadata = {
    solver: 'sat_column',
    problem,
    selectedIndices,
    validSlabs,
  };
  return { model, metadata };
};

export const buildModel = (
  solver: SolverMethod,
  problem: ProblemData,
  breakSymmetries: boolean,
): ModelBundle => {
  const lossArray = computeLossArray(problem.capacities);
  if (solver === 'sat') {
    return buildSatModel(problem, lossArray, breakSymmetries);
  }
  if (solver === 'sat_table') {
    return buildSatTableModel(problem, lossArray, breakSymmetries);
  }
  return buildColumnModel(problem, lossArray);
};

