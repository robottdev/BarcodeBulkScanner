import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { hitsFromResults, mergeHits, planScans } from "../src/barcodes";
import { readerOptions } from "../src/options";
import expected from "./fixtures/expected.json";

const wasmFile = readFileSync(new URL("../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", import.meta.url));
const wasmBinary = wasmFile.buffer.slice(wasmFile.byteOffset, wasmFile.byteOffset + wasmFile.byteLength);

beforeAll(async () => {
  await prepareZXingModule({
    overrides: {
      wasmBinary,
    },
    fireImmediately: true,
  });
});

describe("sample sheet", () => {
  it("reads every barcode in order, including a repeated code and leading zeros", async () => {
    const png = readFileSync(new URL("../public/sample.png", import.meta.url));
    const texts = await readSheet(png);
    expect(texts).toEqual(expected.codes);
  });
});

async function readSheet(png: Buffer): Promise<string[]> {
  const meta = await sharp(png).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const hits = [];
  for (const region of planScans(width, height)) {
    const tile = await sharp(png)
      .extract({ left: region.x, top: region.y, width: region.width, height: region.height })
      .png()
      .toBuffer();
    const results = await readBarcodes(tile, readerOptions);
    hits.push(...hitsFromResults(results, region.x, region.y));
  }
  return mergeHits(hits, width, height).map((item) => item.text);
}
