/**
 * Pixel-art frames for the brewing action scenes.
 *
 * Each scene is a list of frames; each frame is 32 strings of 32 palette
 * characters. Parts are authored below as character sprites and composed into
 * frames once, at module load; the prepare scene's bean is ray-cast instead.
 * `.` is transparent.
 */
export type SceneName =
  | "prepare"
  | "pour"
  | "swirl"
  | "stir"
  | "wait"
  | "drawdown";
export type Frame = readonly string[];

export const SCENE_SIZE = 32;
/** Palette characters and the CSS class that colours them. */
export const PALETTE = {
  k: "px-steel",
  s: "px-shine",
  p: "px-ceramic",
  b: "px-grounds",
  c: "px-coffee",
  w: "px-water",
  g: "px-glass",
  h: "px-accent",
  r: "px-roast",
} as const;
type Ink = keyof typeof PALETTE;
type Point = { x: number; y: number };
type Canvas = string[][];

/** Glass server; `i` marks the interior that fills with coffee. */
const SERVER = [
  "...gggggggggggg.....",
  "..ggiiiiiiiiiigg....",
  ".giiiiiiiiiiiiiigggg",
  ".gsiiiiiiiiiiiiig..g",
  ".gsiiiiiiiiiiiiig..g",
  ".giiiiiiiiiiiiiigggg",
  ".giiiiiiiiiiiiiig...",
  "..giiiiiiiiiiiig....",
  "...gggggggggggg.....",
];
/** V60 cone seen slightly from above: opening with the coffee bed, handle, base. */
const DRIPPER = [
  "...kkkkkkkkkkkkkkkk...",
  "..kpbbbbbbbbbbbbbbpk..",
  "..kppbbbbbbbbbbbbppk..",
  "...kkkkkkkkkkkkkkkk...",
  "...kpppppppppppppkkk..",
  "....kppppppppppppk..k.",
  ".....kppppppppppk..k..",
  "......kppppppppkkkk...",
  ".......kppppppk.......",
  "........kppppk........",
  ".........kkkk.........",
  ".......kkppppkk.......",
  ".....kkkkkkkkkkkk.....",
];
/** Gooseneck kettle; the spout tip points down at column 17, row 3. */
const KETTLE = [
  "......kk..........",
  "...kkkkkkkk.......",
  ".kkkssssssk...kkk.",
  "k..kpsssssk..k...k",
  "k..kpsssssk..k....",
  "k..kpsssssk.k.....",
  "k..kpsssssk.k.....",
  ".kkksssssskkk.....",
  "...kkkkkkkk.......",
];
/** Teaspoon seen from the side: a slanted handle ending in its bowl. */
const SPOON = [
  "......kk",
  ".....kk.",
  "....kk..",
  "....k...",
  "...kk...",
  "...k....",
  "..sss...",
  ".sssss..",
  "..sss...",
];

/** Where the cone and server stand in the brewing scenes. */
const BREWER = { x: 5, y: 10 } as const;
const SERVER_OFFSET = { x: 2, y: 13 } as const;

function blank(): Canvas {
  return Array.from({ length: SCENE_SIZE }, () =>
    Array<string>(SCENE_SIZE).fill("."),
  );
}
function put(canvas: Canvas, x: number, y: number, ink: string) {
  const row = canvas[y];
  if (row && x >= 0 && x < SCENE_SIZE) row[x] = ink;
}
function inkAt(canvas: Canvas, x: number, y: number) {
  return canvas[y]?.[x] ?? ".";
}
/**
 * Copies a sprite onto the canvas. `lean` shifts each row sideways in
 * proportion to its height above the sprite's base, tilting it.
 */
function stamp(
  canvas: Canvas,
  sprite: readonly string[],
  at: Point,
  map: (ink: string, column: number, row: number) => string = (ink) => ink,
  lean = 0,
) {
  sprite.forEach((line, row) => {
    const shift = Math.round((sprite.length - 1 - row) * lean);
    [...line].forEach((ink, column) => {
      const value = map(ink, column, row);
      if (value !== ".") put(canvas, at.x + column + shift, at.y + row, value);
    });
  });
}
function line(canvas: Canvas, from: Point, to: Point, ink: Ink) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let step = 0; step <= steps; step++) {
    const t = steps === 0 ? 0 : step / steps;
    put(
      canvas,
      Math.round(from.x + (to.x - from.x) * t),
      Math.round(from.y + (to.y - from.y) * t),
      ink,
    );
  }
}
/** Cone on its server, with coffee in the server from row `level` down. */
function brewer(canvas: Canvas, level: number, at: Point = BREWER, lean = 0) {
  const server = { x: at.x + SERVER_OFFSET.x, y: at.y + SERVER_OFFSET.y };
  stamp(canvas, SERVER, server, (ink, _, row) =>
    ink === "i" ? (server.y + row >= level ? "c" : ".") : ink,
  );
  stamp(canvas, DRIPPER, at, undefined, lean);
}
/** Recolours bed cells; `pick` gets the cell and the row's bed extent. */
function bed(
  canvas: Canvas,
  ink: Ink | "p",
  pick: (x: number, y: number, left: number, right: number) => boolean,
  rows: readonly number[] = [BREWER.y + 1, BREWER.y + 2],
) {
  for (const y of rows) {
    const cells = Array.from({ length: SCENE_SIZE }, (_, x) => x).filter(
      (x) => inkAt(canvas, x, y) === "b",
    );
    const left = cells[0] ?? 0;
    const right = cells.at(-1) ?? 0;
    for (const x of cells) if (pick(x, y, left, right)) put(canvas, x, y, ink);
  }
}
/** Two falling coffee drops inside the server, above the coffee level. */
function drips(canvas: Canvas, index: number, level: number) {
  const top = BREWER.y + SERVER_OFFSET.y + 1;
  for (const offset of [0, 3]) {
    const y = top + ((index * 2 + offset) % 6);
    if (y < level - 1) put(canvas, 15 + (offset ? 1 : 0), y, "c");
  }
}
function frame(canvas: Canvas): Frame {
  return canvas.map((row) => row.join(""));
}

function pour(index: number): Frame {
  const canvas = blank();
  const level = 29 - Math.floor(index / 2);
  brewer(canvas, level);
  // The stream circles over the bed: left, back, right, front.
  const impact = [
    { x: 13, y: 12 },
    { x: 16, y: 11 },
    { x: 19, y: 12 },
    { x: 16, y: 12 },
  ][index] ?? { x: 16, y: 12 };
  bed(
    canvas,
    "w",
    (x, y) => Math.abs(x - impact.x) <= (y === impact.y ? 2 : 1),
  );
  stamp(canvas, KETTLE, { x: 0, y: 0 });
  line(canvas, { x: 17, y: 4 }, impact, "w");
  drips(canvas, index, level);
  return frame(canvas);
}
/** Arrowheads for paths ending at the top (heading right) or bottom (heading left). */
const HEADS = {
  right: [
    [-1, -2],
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 2],
  ],
  left: [
    [1, -2],
    [0, -1],
    [-1, 0],
    [0, 1],
    [1, 2],
  ],
} as const;
/** A flat circular arrow above the cone, ending at the back or the front. */
function swirlArrow(canvas: Canvas, front: boolean) {
  const start = front ? Math.PI : 0;
  const end = start + Math.PI * 1.5;
  let last: Point = { x: 0, y: 0 };
  for (let angle = start; angle <= end + 0.001; angle += 0.02) {
    last = {
      x: Math.round(15 + Math.cos(angle) * 10),
      y: Math.round(4.5 + Math.sin(angle) * 2.6),
    };
    put(canvas, last.x, last.y, "h");
  }
  // Angles grow clockwise on screen: the back end heads right, the front left.
  for (const [dx, dy] of HEADS[front ? "left" : "right"])
    put(canvas, last.x + dx, last.y + dy, "h");
}
function swirl(index: number): Frame {
  const canvas = blank();
  const lean = [-0.17, 0, 0.17, 0][index] ?? 0;
  brewer(canvas, 29, BREWER, lean);
  // Liquid sloshes towards the lower side of the tilt.
  bed(canvas, "w", (x, _, left, right) => {
    const middle = (left + right) / 2;
    if (lean < 0) return x <= middle + 1;
    if (lean > 0) return x >= middle - 1;
    return Math.abs(x - middle) < 5;
  });
  swirlArrow(canvas, index >= 2);
  return frame(canvas);
}
/** The spoon sweeps across the slurry: left, middle, right, middle. */
function stir(index: number): Frame {
  const canvas = blank();
  brewer(canvas, 29);
  const bowl = [11, 15, 19, 15][index] ?? 15;
  // Water trails the spoon, so the wake shows beside the bowl.
  const wake = [-3, 0, 3, 0][index] ?? 0;
  bed(canvas, "w", (x) => Math.abs(x - bowl + wake) <= 3);
  stamp(canvas, SPOON, { x: bowl - 3, y: BREWER.y - 6 });
  return frame(canvas);
}
function steam(canvas: Canvas, index: number, columns: readonly number[]) {
  columns.forEach((column, wisp) => {
    for (let step = 0; step < 3; step++) {
      const y = 8 - ((step * 3 + index + wisp * 2) % 8);
      const sway = [0, 1, 1, 0, -1, -1][(y + wisp) % 6] ?? 0;
      put(canvas, column + sway, y, "g");
      put(canvas, column + sway, y - 1, "g");
    }
  });
}
function wait(index: number): Frame {
  const canvas = blank();
  brewer(canvas, 29);
  // Bubbles rise through the bed while the coffee rests.
  const bubbles = [
    [10, 11],
    [14, 12],
    [18, 11],
    [21, 12],
    [12, 12],
    [17, 12],
    [20, 11],
    [15, 11],
  ] as const;
  bubbles.forEach(([x, y], bubble) => {
    if ((bubble + index) % 2 === 0 && inkAt(canvas, x, y) === "b")
      put(canvas, x, y, "p");
  });
  steam(canvas, index * 2, [12, 19]);
  drips(canvas, index, 29);
  return frame(canvas);
}
function drawdown(index: number): Frame {
  const canvas = blank();
  const level = 29 - index;
  brewer(canvas, level);
  // The water above the bed drains away until the bed lies flat.
  const pool = [7, 5, 3, 0][index] ?? 0;
  bed(canvas, "w", (x, y) => y === BREWER.y + 1 && Math.abs(x - 15.5) < pool);
  drips(canvas, index, level);
  return frame(canvas);
}
const BEAN = { length: 12, width: 9, depth: 6 } as const;
const BEAN_TILT = 0.35;
const BEAN_FRAMES = 12;
const LIGHT = { x: -0.4, y: -0.5, z: 0.77 };
function creaseOffset(along: number) {
  return Math.sin((Math.PI * along) / BEAN.length) * 1.4;
}
function beanInk(dx: number, dy: number, angle: number) {
  const { length, width, depth } = BEAN;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const leanCos = Math.cos(BEAN_TILT);
  const leanSin = Math.sin(BEAN_TILT);
  const across = dx * leanCos + dy * leanSin;
  const along = dy * leanCos - dx * leanSin;
  const a = sin ** 2 / width ** 2 + cos ** 2 / depth ** 2;
  const b = 2 * across * cos * sin * (1 / depth ** 2 - 1 / width ** 2);
  const c =
    across ** 2 * (cos ** 2 / width ** 2 + sin ** 2 / depth ** 2) +
    along ** 2 / length ** 2 -
    1;
  const discriminant = b ** 2 - 4 * a * c;
  if (discriminant < 0) return ".";
  const z = (-b + Math.sqrt(discriminant)) / (2 * a);
  const modelX = across * cos - z * sin;
  const modelZ = across * sin + z * cos;
  const onFront = modelZ > 0 && Math.abs(along) < length * 0.86;
  const fromCrease = Math.abs(modelX - creaseOffset(along));
  if (onFront && fromCrease < 0.9) return "r";
  const nx = modelX / width ** 2;
  const ny = along / length ** 2;
  const nz = modelZ / depth ** 2;
  const turnedX = nx * cos + nz * sin;
  const turnedZ = nz * cos - nx * sin;
  const screenX = turnedX * leanCos - ny * leanSin;
  const screenY = turnedX * leanSin + ny * leanCos;
  const lit =
    (screenX * LIGHT.x + screenY * LIGHT.y + turnedZ * LIGHT.z) /
    Math.hypot(screenX, screenY, turnedZ);
  const lip = onFront && fromCrease < 1.8 ? 0.12 : 0;
  return lit + lip > 0.85 ? "h" : lit > 0.3 ? "b" : "c";
}
function bean(canvas: Canvas, angle: number) {
  const centre = SCENE_SIZE / 2;
  for (let y = 0; y < SCENE_SIZE; y++)
    for (let x = 0; x < SCENE_SIZE; x++)
      put(canvas, x, y, beanInk(x + 0.5 - centre, y + 0.5 - centre, angle));
  const edge = (x: number, y: number) =>
    inkAt(canvas, x, y) !== "." &&
    [
      inkAt(canvas, x - 1, y),
      inkAt(canvas, x + 1, y),
      inkAt(canvas, x, y - 1),
      inkAt(canvas, x, y + 1),
    ].includes(".");
  const rim: Point[] = [];
  for (let y = 0; y < SCENE_SIZE; y++)
    for (let x = 0; x < SCENE_SIZE; x++) if (edge(x, y)) rim.push({ x, y });
  for (const { x, y } of rim) put(canvas, x, y, "r");
}
function prepare(index: number): Frame {
  const canvas = blank();
  bean(canvas, (index * 2 * Math.PI) / BEAN_FRAMES);
  return frame(canvas);
}
function frames(count: number, draw: (index: number) => Frame) {
  return Array.from({ length: count }, (_, index) => draw(index));
}
export const scenes: Record<SceneName, readonly Frame[]> = {
  prepare: frames(BEAN_FRAMES, prepare),
  pour: frames(4, pour),
  swirl: frames(4, swirl),
  stir: frames(4, stir),
  wait: frames(4, wait),
  drawdown: frames(4, drawdown),
};
