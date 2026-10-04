import { writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { scenes } from "../src/ui/sceneFrames.ts";

// Mirrors the light and dark --px-* tokens in src/ui/styles.css.
const LIGHT = { r: "#3a1d0e", h: "#c0701a", b: "#8c5a32", c: "#5b3119" };
const DARK = { r: "#3f2314", h: "#e9b665", b: "#b07a48", c: "#a0643a" };
const BACKGROUND = "#33452f";
type Palette = Record<string, string>;

const bean = scenes.prepare[0] ?? [];
const pixels = bean.flatMap((row, y) =>
  [...row].flatMap((ink, x) => (ink === "." ? [] : [{ x, y, ink }])),
);
const left = Math.min(...pixels.map((p) => p.x));
const top = Math.min(...pixels.map((p) => p.y));
const width = Math.max(...pixels.map((p) => p.x)) - left + 1;
const height = Math.max(...pixels.map((p) => p.y)) - top + 1;

function svg() {
  const fills = (palette: Palette) =>
    Object.entries(palette)
      .map(([ink, colour]) => `.${ink}{fill:${colour}}`)
      .join("");
  const side = 32;
  const rects = pixels
    .map(
      (p) =>
        `<rect class="${p.ink}" x="${p.x}" y="${p.y}" width="1" height="1"/>`,
    )
    .join("");
  const x = left - Math.floor((side - width) / 2);
  const y = top - Math.floor((side - height) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}" shape-rendering="crispEdges"><title>Pourover Wizard</title><style>${fills(LIGHT)}@media (prefers-color-scheme:dark){${fills(DARK)}}</style>${rects}</svg>\n`;
}

function rgba(hex: string) {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

// Whole-pixel cells keep the art crisp; the bean stays inside the maskable safe zone.
function png(
  size: number,
  cell: number,
  palette: Palette,
  background?: string,
) {
  // App Store icons must not carry an alpha channel.
  const channels = background ? 3 : 4;
  const stride = size * channels;
  const image = Buffer.alloc(size * stride);
  const fill = (x: number, y: number, colour: string) =>
    image.set(
      [...rgba(colour), 255].slice(0, channels),
      y * stride + x * channels,
    );
  if (background)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) fill(x, y, background);
  const offsetX = Math.floor((size - width * cell) / 2);
  const offsetY = Math.floor((size - height * cell) / 2);
  for (const p of pixels)
    for (let dy = 0; dy < cell; dy++)
      for (let dx = 0; dx < cell; dx++)
        fill(
          offsetX + (p.x - left) * cell + dx,
          offsetY + (p.y - top) * cell + dy,
          palette[p.ink] ?? "#000000",
        );
  const rows = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++)
    image.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, background ? 2 : 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const appIcon = (size: number) =>
  png(size, Math.floor((size * 12) / 512), DARK, BACKGROUND);
writeFileSync("pwa/favicon.svg", svg());
writeFileSync("pwa/favicon-96.png", png(96, 3, LIGHT));
for (const size of [180, 192, 512])
  writeFileSync(`pwa/icon-${size}.png`, appIcon(size));
writeFileSync(
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  appIcon(1024),
);
