import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { hitsFromResults, type Hit } from "./barcodes";
import { liveReaderOptions, readerOptions } from "./options";

prepareZXingModule({
  overrides: {
    locateFile: (path: string) => (path.endsWith(".wasm") ? wasmUrl : path),
  },
  fireImmediately: true,
});

type ScanRequest = {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  live?: boolean;
};

export type ScanResponse = {
  id: number;
  hits?: Hit[];
  error?: string;
};

self.onmessage = async (event: MessageEvent<ScanRequest>) => {
  const { id, buffer, width, height, offsetX, offsetY, live } = event.data;
  try {
    const pixels = new Uint8ClampedArray(buffer);
    const image = new ImageData(pixels, width, height);
    const results = await readBarcodes(image, live ? liveReaderOptions : readerOptions);
    const hits = hitsFromResults(results, offsetX, offsetY);
    const response: ScanResponse = { id, hits };
    self.postMessage(response);
  } catch (error) {
    const response: ScanResponse = {
      id,
      error: error instanceof Error ? error.message : "Could not read barcodes",
    };
    self.postMessage(response);
  }
};
