import { mkdir } from "node:fs/promises";
import bwipjs from "bwip-js";
import sharp from "sharp";

const codes = [
  { bcid: "code128", text: "00012345" },
  { bcid: "code128", text: "SKU-10021" },
  { bcid: "code128", text: "SKU-10022" },
  { bcid: "qrcode", text: "BIN-A-14" },
  { bcid: "qrcode", text: "LOT-7781" },
  { bcid: "datamatrix", text: "DM-55" },
  { bcid: "ean13", text: "4006381333931" },
  { bcid: "upca", text: "012345678905" },
  { bcid: "code39", text: "CODE39" },
  { bcid: "pdf417", text: "SHIP-2048" },
  { bcid: "code128", text: "SKU-10021" },
];

const cells = [];
for (const code of codes) {
  const linear = code.bcid !== "qrcode" && code.bcid !== "datamatrix";
  const png = await bwipjs.toBuffer({
    bcid: code.bcid,
    text: code.text,
    scale: code.bcid === "pdf417" ? 2 : 3,
    ...(linear ? { height: 12 } : {}),
    includetext: false,
    paddingwidth: 8,
    paddingheight: 8,
  });
  const padded = await sharp(png)
    .extend({ top: 18, bottom: 18, left: 28, right: 28, background: "#ffffff" })
    .png()
    .toBuffer();
  const meta = await sharp(padded).metadata();
  cells.push({ png: padded, width: meta.width ?? 0, height: meta.height ?? 0, text: code.text });
}

const sheetWidth = 1400;
const margin = 56;
const gap = 28;
let x = margin;
let y = 120;
let rowHeight = 0;
const layers = [];

for (const cell of cells) {
  if (x + cell.width > sheetWidth - margin) {
    x = margin;
    y += rowHeight + gap;
    rowHeight = 0;
  }
  layers.push({ input: cell.png, left: x, top: y });
  x += cell.width + gap;
  rowHeight = Math.max(rowHeight, cell.height);
}

const sheetHeight = y + rowHeight + margin;
const title = Buffer.from(
  `<svg width="${sheetWidth}" height="100" xmlns="http://www.w3.org/2000/svg">
    <text x="56" y="64" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="#17211b">Sample labels</text>
  </svg>`,
);

await mkdir("public", { recursive: true });
await sharp({
  create: {
    width: sheetWidth,
    height: sheetHeight,
    channels: 3,
    background: "#ffffff",
  },
})
  .composite([{ input: title, left: 0, top: 12 }, ...layers])
  .png()
  .toFile("public/sample.png");

const icon = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
    <rect width="180" height="180" rx="40" fill="#16382c"/>
    <g fill="#f4faf6">
      <rect x="38" y="40" width="16" height="100" rx="2"/>
      <rect x="62" y="40" width="8" height="100"/>
      <rect x="78" y="40" width="22" height="100" rx="2"/>
      <rect x="108" y="40" width="8" height="100"/>
      <rect x="124" y="40" width="18" height="100" rx="2"/>
    </g>
  </svg>`,
);
await sharp(icon).png().toFile("public/apple-touch-icon.png");
await sharp(icon).resize(32, 32).png().toFile("public/favicon-32.png");

console.log(`Wrote public/sample.png (${sheetWidth}x${sheetHeight}) and icons`);
