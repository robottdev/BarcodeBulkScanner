import type { ReaderOptions } from "zxing-wasm/reader";

/**
 * Accuracy over speed. An empty format list asks ZXing for every symbology.
 * Escaped text turns control characters into tokens so one barcode stays one spreadsheet cell.
 */
export const readerOptions: ReaderOptions = {
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 255,
  textMode: "Escaped",
  formats: [],
};
