export type Point = { x: number; y: number };

export type Position = {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
};

export type Rect = { x: number; y: number; width: number; height: number };

export type Hit = {
  text: string;
  format: string;
  lineCount: number;
  position: Position;
};

export type Box = { x: number; y: number; width: number; height: number };

export type ListedBarcode = {
  text: string;
  format: string;
  formatLabel: string;
  box: Box;
};

type RawResult = {
  text: string;
  format: string;
  isValid: boolean;
  error?: string;
  lineCount?: number;
  position: Position;
};

const FORMAT_LABELS: Record<string, string> = {
  QRCode: "QR Code",
  QRCodeModel1: "QR Code",
  QRCodeModel2: "QR Code",
  MicroQRCode: "Micro QR",
  RMQRCode: "rMQR",
  Code128: "Code 128",
  Code39: "Code 39",
  Code39Std: "Code 39",
  Code39Ext: "Code 39",
  Code93: "Code 93",
  Code32: "Code 32",
  EAN13: "EAN-13",
  EAN8: "EAN-8",
  EAN5: "EAN-5",
  EAN2: "EAN-2",
  UPCA: "UPC-A",
  UPCE: "UPC-E",
  ISBN: "ISBN",
  ITF: "ITF",
  ITF14: "ITF-14",
  DataMatrix: "Data Matrix",
  PDF417: "PDF417",
  CompactPDF417: "PDF417",
  MicroPDF417: "Micro PDF417",
  Aztec: "Aztec",
  AztecCode: "Aztec",
  Codabar: "Codabar",
  DataBar: "DataBar",
  DataBarOmni: "DataBar",
  DataBarLtd: "DataBar Limited",
  DataBarExp: "DataBar Expanded",
  DataBarStk: "DataBar Stacked",
  DataBarStkOmni: "DataBar Stacked",
  DataBarExpStk: "DataBar Expanded",
  MaxiCode: "MaxiCode",
};

const OVERLAP = 0.5;

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Collapse characters that would split or shift a spreadsheet cell. */
export function cleanBarcodeText(value: string): string {
  return value.replace(/[\t\r\n\u0000-\u001f]+/g, " ").trim();
}

export function fitSize(
  width: number,
  height: number,
  maxEdge = 3200,
  maxPixels = 8_000_000,
): { width: number; height: number; scale: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const edgeScale = Math.min(1, maxEdge / Math.max(safeWidth, safeHeight));
  const pixelScale = Math.min(1, Math.sqrt(maxPixels / (safeWidth * safeHeight)));
  const scale = Math.min(edgeScale, pixelScale);
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
    scale,
  };
}

/**
 * Full frame first, then overlapping grids so a sheet of small labels is not
 * limited to the symbols ZXing returns from a single pass.
 */
export function planScans(width: number, height: number): Rect[] {
  const full: Rect = { x: 0, y: 0, width, height };
  const longEdge = Math.max(width, height);
  if (longEdge < 1100) return [full];
  const rects = [full, ...gridRects(width, height, 2)];
  if (longEdge >= 2000) rects.push(...gridRects(width, height, 3));
  return rects;
}

export function shiftPosition(position: Position, dx: number, dy: number): Position {
  const move = (point: Point): Point => ({ x: point.x + dx, y: point.y + dy });
  return {
    topLeft: move(position.topLeft),
    topRight: move(position.topRight),
    bottomLeft: move(position.bottomLeft),
    bottomRight: move(position.bottomRight),
  };
}

export function hitsFromResults(results: RawResult[], offsetX = 0, offsetY = 0): Hit[] {
  const hits: Hit[] = [];
  for (const result of results) {
    if (!result.isValid || result.error || result.format === "None") continue;
    const text = cleanBarcodeText(result.text);
    if (!text) continue;
    hits.push({
      text,
      format: result.format,
      lineCount: result.lineCount ?? 0,
      position: shiftPosition(result.position, offsetX, offsetY),
    });
  }
  return hits;
}

export function mergeHits(hits: Hit[], width: number, height: number): ListedBarcode[] {
  const accepted: Hit[] = [];
  for (const hit of hits) {
    const duplicate = accepted.find((kept) => samePhysicalCode(kept, hit));
    if (!duplicate) accepted.push(hit);
  }
  const withoutShadows = dropOverlappingShadows(accepted);
  return readingOrder(withoutShadows.map((hit) => toListed(hit, width, height)));
}

export function spreadsheetText(
  rows: { text: string; formatLabel: string }[],
  includeFormat: boolean,
): string {
  return rows
    .map((row) => {
      const value = cleanBarcodeText(row.text);
      if (!value) return "";
      if (!includeFormat) return value;
      return `${value}\t${cleanBarcodeText(row.formatLabel)}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function spreadsheetHtml(
  rows: { text: string; formatLabel: string }[],
  includeFormat: boolean,
): string {
  const body = rows
    .map((row) => {
      const cells = [cleanBarcodeText(row.text)];
      if (!cells[0]) return "";
      if (includeFormat) cells.push(cleanBarcodeText(row.formatLabel));
      const tds = cells
        .map((cell) => `<td style="mso-number-format:'\\@';">${escapeHtml(cell)}</td>`)
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .filter(Boolean)
    .join("");
  return `<!DOCTYPE html><html><body><!--StartFragment--><table>${body}</table><!--EndFragment--></body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gridRects(width: number, height: number, n: number): Rect[] {
  const tileW = Math.ceil(width / (1 + (n - 1) * (1 - OVERLAP)));
  const tileH = Math.ceil(height / (1 + (n - 1) * (1 - OVERLAP)));
  const stepX = (width - tileW) / (n - 1);
  const stepY = (height - tileH) / (n - 1);
  const rects: Rect[] = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const x = Math.min(width - 1, Math.max(0, Math.round(col * stepX)));
      const y = Math.min(height - 1, Math.max(0, Math.round(row * stepY)));
      rects.push({
        x,
        y,
        width: Math.max(1, Math.min(tileW, width - x)),
        height: Math.max(1, Math.min(tileH, height - y)),
      });
    }
  }
  return rects;
}

function bounds(position: Position): { x: number; y: number; width: number; height: number } {
  const xs = [position.topLeft.x, position.topRight.x, position.bottomLeft.x, position.bottomRight.x];
  const ys = [position.topLeft.y, position.topRight.y, position.bottomLeft.y, position.bottomRight.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function center(position: Position): Point {
  const box = bounds(position);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function span(position: Position): number {
  const box = bounds(position);
  return Math.max(box.width, box.height, 1);
}

function samePhysicalCode(a: Hit, b: Hit): boolean {
  if (a.text !== b.text || a.format !== b.format) return false;
  const aCenter = center(a.position);
  const bCenter = center(b.position);
  const distance = Math.hypot(aCenter.x - bCenter.x, aCenter.y - bCenter.y);
  const reach = Math.max(span(a.position), span(b.position)) * 0.65;
  return distance <= Math.max(reach, 16);
}

function dropOverlappingShadows(hits: Hit[]): Hit[] {
  return hits.filter((hit) => {
    const box = bounds(hit.position);
    const area = Math.max(1, box.width * box.height);
    return !hits.some((other) => {
      if (other === hit || other.text === hit.text) return false;
      const otherBox = bounds(other.position);
      const overlap = intersectionArea(box, otherBox) / area;
      if (overlap < 0.62) return false;
      const otherArea = otherBox.width * otherBox.height;
      if (otherArea > area * 1.15) return true;
      return otherArea >= area * 0.85 && other.lineCount > hit.lineCount;
    });
  });
}

function intersectionArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

function toListed(hit: Hit, width: number, height: number): ListedBarcode {
  const box = bounds(hit.position);
  const x = clamp01(box.x / width);
  const y = clamp01(box.y / height);
  return {
    text: hit.text,
    format: hit.format,
    formatLabel: formatLabel(hit.format),
    box: {
      x,
      y,
      width: clamp01(x + box.width / width) - x,
      height: clamp01(y + box.height / height) - y,
    },
  };
}

function readingOrder(items: ListedBarcode[]): ListedBarcode[] {
  const sorted = [...items].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const rows: ListedBarcode[][] = [];
  for (const item of sorted) {
    const row = rows.find((candidate) => candidate.some((other) => verticallyAligned(item.box, other.box)));
    if (row) row.push(item);
    else rows.push([item]);
  }
  rows.sort((a, b) => topOf(a) - topOf(b));
  return rows.flatMap((row) => row.sort((a, b) => a.box.x - b.box.x));
}

function verticallyAligned(a: Box, b: Box): boolean {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const overlap = Math.max(0, bottom - top);
  const minHeight = Math.max(0.001, Math.min(a.height, b.height));
  return overlap >= minHeight * 0.35;
}

function topOf(row: ListedBarcode[]): number {
  return Math.min(...row.map((item) => item.box.y));
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
