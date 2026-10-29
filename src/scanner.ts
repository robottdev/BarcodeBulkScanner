import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { fitSize, hitsFromResults, mergeHits, planScans, type Hit, type ListedBarcode } from "./barcodes";
import { readerOptions } from "./options";

export type ScanProgress = {
  done: number;
  total: number;
  found: number;
};

type ScanResponse = {
  id: number;
  hits?: Hit[];
  error?: string;
};

type Waiter = {
  resolve: (hits: Hit[]) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let workerFailed = false;
let sequence = 0;
const pending = new Map<number, Waiter>();
let mainModule: Promise<unknown> | null = null;

export function paintPhoto(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): void {
  const size = fitSize(sourceWidth, sourceHeight);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not open that photo.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(source, 0, 0, size.width, size.height);
}

export async function scanPhoto(
  canvas: HTMLCanvasElement,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: ScanProgress) => void;
    onPartial?: (items: ListedBarcode[]) => void;
  } = {},
): Promise<ListedBarcode[]> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not open that photo.");
  const regions = planScans(canvas.width, canvas.height);
  const hits: Hit[] = [];
  let failures = 0;

  options.onProgress?.({ done: 0, total: regions.length, found: 0 });

  for (let index = 0; index < regions.length; index += 1) {
    if (options.signal?.aborted) throw abortError();
    const region = regions[index];
    if (!region) continue;
    try {
      const image = context.getImageData(region.x, region.y, region.width, region.height);
      const found = await scanImage(image, region.x, region.y, options.signal);
      hits.push(...found);
    } catch (error) {
      if (isAbort(error)) throw error;
      failures += 1;
    }
    const merged = mergeHits(hits, canvas.width, canvas.height);
    options.onPartial?.(merged);
    options.onProgress?.({ done: index + 1, total: regions.length, found: merged.length });
    await yieldToUi();
  }

  const merged = mergeHits(hits, canvas.width, canvas.height);
  if (merged.length === 0 && failures === regions.length) {
    throw new Error("Could not read barcodes from that photo. Reload the page and try again.");
  }
  return merged;
}

async function scanImage(
  image: ImageData,
  offsetX: number,
  offsetY: number,
  signal?: AbortSignal,
): Promise<Hit[]> {
  if (signal?.aborted) throw abortError();
  if (!workerFailed) {
    try {
      return await withTimeout(scanWithWorker(image, offsetX, offsetY), 25_000, signal);
    } catch (error) {
      if (isAbort(error)) throw error;
      workerFailed = true;
      worker?.terminate();
      worker = null;
      for (const waiter of pending.values()) {
        waiter.reject(error instanceof Error ? error : new Error("Barcode reader failed"));
      }
      pending.clear();
    }
  }
  return withTimeout(scanOnMain(image, offsetX, offsetY), 25_000, signal);
}

function scanWithWorker(image: ImageData, offsetX: number, offsetY: number): Promise<Hit[]> {
  const id = ++sequence;
  const pixels = new Uint8ClampedArray(image.data);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage(
      {
        id,
        buffer: pixels.buffer,
        width: image.width,
        height: image.height,
        offsetX,
        offsetY,
      },
      [pixels.buffer],
    );
  });
}

async function scanOnMain(image: ImageData, offsetX: number, offsetY: number): Promise<Hit[]> {
  mainModule ??= prepareZXingModule({
    overrides: {
      locateFile: (path: string) => (path.endsWith(".wasm") ? wasmUrl : path),
    },
    fireImmediately: true,
  });
  await mainModule;
  const results = await readBarcodes(image, readerOptions);
  return hitsFromResults(results, offsetX, offsetY);
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<ScanResponse>) => {
      const waiter = pending.get(event.data.id);
      if (!waiter) return;
      pending.delete(event.data.id);
      if (event.data.error) waiter.reject(new Error(event.data.error));
      else waiter.resolve(event.data.hits ?? []);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Barcode reader failed");
      for (const waiter of pending.values()) waiter.reject(error);
      pending.clear();
    };
  }
  return worker;
}

function withTimeout(work: Promise<Hit[]>, ms: number, signal?: AbortSignal): Promise<Hit[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Reading that part of the photo took too long.")), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    });
  });
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function abortError(): DOMException {
  return new DOMException("Scan cancelled", "AbortError");
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
