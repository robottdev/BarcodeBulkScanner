import { describe, expect, it } from "vitest";
import {
  cleanBarcodeText,
  fitSize,
  mergeHits,
  planScans,
  spreadsheetHtml,
  spreadsheetText,
  type Hit,
  type Position,
} from "../src/barcodes";

function position(x: number, y: number, width: number, height: number): Position {
  return {
    topLeft: { x, y },
    topRight: { x: x + width, y },
    bottomLeft: { x, y: y + height },
    bottomRight: { x: x + width, y: y + height },
  };
}

function hit(text: string, x: number, y: number, width = 120, height = 40, format = "Code128"): Hit {
  return { text, format, lineCount: 4, position: position(x, y, width, height) };
}

describe("spreadsheet list", () => {
  it("puts one barcode on each line and keeps leading zeros", () => {
    const text = spreadsheetText(
      [
        { text: "00012345", formatLabel: "Code 128" },
        { text: "SKU-10021", formatLabel: "Code 128" },
      ],
      false,
    );
    expect(text).toBe("00012345\nSKU-10021");
    expect(text.endsWith("\n")).toBe(false);
  });

  it("adds the barcode type as a second column", () => {
    const text = spreadsheetText([{ text: "BIN-A-14", formatLabel: "QR Code" }], true);
    expect(text).toBe("BIN-A-14\tQR Code");
  });

  it("keeps a barcode with line breaks inside one cell", () => {
    expect(cleanBarcodeText("A\nB\tC")).toBe("A B C");
    expect(spreadsheetText([{ text: "A\nB", formatLabel: "QR Code" }], false)).toBe("A B");
  });

  it("marks spreadsheet cells as text so Excel keeps leading zeros", () => {
    const html = spreadsheetHtml([{ text: "00012345", formatLabel: "Code 128" }], false);
    expect(html).toContain("mso-number-format:'\\@'");
    expect(html).toContain(">00012345<");
    expect(spreadsheetHtml([{ text: "A<B>&", formatLabel: "QR Code" }], true)).toContain("A&lt;B&gt;&amp;");
  });
});

describe("mergeHits", () => {
  it("keeps two copies of the same code when they sit apart", () => {
    const merged = mergeHits([hit("SKU-10021", 10, 10), hit("SKU-10021", 10, 800)], 1000, 1200);
    expect(merged.map((item) => item.text)).toEqual(["SKU-10021", "SKU-10021"]);
  });

  it("collapses the same code found again in an overlapping tile", () => {
    const merged = mergeHits(
      [hit("SKU-10021", 100, 100), hit("SKU-10021", 108, 104), hit("SKU-10022", 400, 100)],
      1000,
      800,
    );
    expect(merged.map((item) => item.text)).toEqual(["SKU-10021", "SKU-10022"]);
  });

  it("drops a smaller misread that sits inside a real barcode", () => {
    const merged = mergeHits(
      [
        hit("REAL-1", 50, 40, 280, 90),
        hit("999", 80, 55, 70, 30, "ITF"),
      ],
      800,
      400,
    );
    expect(merged.map((item) => item.text)).toEqual(["REAL-1"]);
  });

  it("reads a mixed row from left to right, then the row below", () => {
    const merged = mergeHits(
      [
        hit("RIGHT", 500, 30, 100, 40),
        hit("LOWER", 20, 300, 100, 40),
        hit("LEFT", 20, 36, 100, 36),
      ],
      1000,
      800,
    );
    expect(merged.map((item) => item.text)).toEqual(["LEFT", "RIGHT", "LOWER"]);
  });
});

describe("planScans", () => {
  it("covers a phone-sized photo with overlapping passes", () => {
    const width = 3000;
    const height = 2200;
    const rects = planScans(width, height);
    expect(rects[0]).toEqual({ x: 0, y: 0, width, height });
    expect(rects.length).toBeGreaterThan(5);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    }
    for (let y = 0; y < height; y += 40) {
      for (let x = 0; x < width; x += 40) {
        const covered = rects.some(
          (rect) => x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height,
        );
        expect(covered).toBe(true);
      }
    }
  });

  it("scales a 48 megapixel photo under a phone canvas limit", () => {
    const size = fitSize(8064, 6048);
    expect(size.width).toBeLessThanOrEqual(3200);
    expect(size.height).toBeLessThanOrEqual(3200);
    expect(size.width * size.height).toBeLessThanOrEqual(8_000_000);
  });
});
