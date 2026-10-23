type ElementPoint = {
  id: number;
  x: number;
  y: number;
};

type CoverRegion = {
  id: number;
  name: string;
  cost: number;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  radius: string;
  elements: number[];
};

export const elements: ElementPoint[] = [
  { id: 0, x: 12, y: 22 },
  { id: 1, x: 23, y: 16 },
  { id: 2, x: 35, y: 27 },
  { id: 3, x: 51, y: 18 },
  { id: 4, x: 68, y: 24 },
  { id: 5, x: 82, y: 18 },
  { id: 6, x: 18, y: 48 },
  { id: 7, x: 35, y: 54 },
  { id: 8, x: 50, y: 46 },
  { id: 9, x: 66, y: 54 },
  { id: 10, x: 83, y: 48 },
  { id: 11, x: 28, y: 78 },
  { id: 12, x: 52, y: 76 },
  { id: 13, x: 76, y: 78 },
];

export const regions: CoverRegion[] = [
  {
    id: 0,
    name: 'Northwest route',
    cost: 5,
    color: '#0969da',
    x: 8,
    y: 12,
    width: 31,
    height: 46,
    rotation: 0,
    radius: '2rem 3rem 2.2rem 2.8rem',
    elements: [0, 1, 2, 6, 7],
  },
  {
    id: 1,
    name: 'North ridge',
    cost: 6,
    color: '#8250df',
    x: 31,
    y: 14,
    width: 41,
    height: 45,
    rotation: 0,
    radius: '2.6rem 2rem 3rem 2.1rem',
    elements: [2, 3, 4, 8, 9],
  },
  {
    id: 2,
    name: 'East loop',
    cost: 5,
    color: '#cf222e',
    x: 62,
    y: 14,
    width: 26,
    height: 69,
    rotation: 0,
    radius: '2rem 2.8rem 2.4rem 3rem',
    elements: [4, 5, 9, 10, 13],
  },
  {
    id: 3,
    name: 'Southwest sweep',
    cost: 4,
    color: '#1a7f37',
    x: 14,
    y: 44,
    width: 43,
    height: 39,
    rotation: 0,
    radius: '2.4rem 2rem 3rem 2.2rem',
    elements: [6, 7, 11, 12],
  },
  {
    id: 4,
    name: 'South belt',
    cost: 6,
    color: '#bf8700',
    x: 46,
    y: 42,
    width: 42,
    height: 41,
    rotation: 0,
    radius: '3rem 2rem 2.5rem 2.2rem',
    elements: [8, 9, 10, 12, 13],
  },
  {
    id: 5,
    name: 'Central express',
    cost: 7,
    color: '#d1248f',
    x: 19,
    y: 12,
    width: 52,
    height: 47,
    rotation: 0,
    radius: '2rem 3rem 2rem 3rem',
    elements: [1, 2, 3, 7, 8, 9],
  },
];

