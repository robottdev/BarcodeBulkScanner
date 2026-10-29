import { cleanBarcodeText, spreadsheetHtml, spreadsheetText, type ListedBarcode } from "./barcodes";
import { paintPhoto, scanPhoto } from "./scanner";

type Item = ListedBarcode & { id: string; thumb: string };

const takePhoto = document.querySelector<HTMLButtonElement>("#take-photo")!;
const choosePhoto = document.querySelector<HTMLButtonElement>("#choose-photo")!;
const trySample = document.querySelector<HTMLButtonElement>("#try-sample")!;
const cameraInput = document.querySelector<HTMLInputElement>("#camera-input")!;
const libraryInput = document.querySelector<HTMLInputElement>("#library-input")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const progress = document.querySelector<HTMLDivElement>("#progress")!;
const progressBar = document.querySelector<HTMLDivElement>("#progress-bar")!;
const stage = document.querySelector<HTMLElement>("#stage")!;
const photo = document.querySelector<HTMLCanvasElement>("#photo")!;
const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
const results = document.querySelector<HTMLElement>("#results")!;
const countEl = document.querySelector<HTMLParagraphElement>("#count")!;
const found = document.querySelector<HTMLOListElement>("#found")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear")!;
const includeFormat = document.querySelector<HTMLInputElement>("#include-format")!;
const sheet = document.querySelector<HTMLTextAreaElement>("#sheet")!;
const sheetHint = document.querySelector<HTMLParagraphElement>("#sheet-hint")!;
const dupeHint = document.querySelector<HTMLParagraphElement>("#dupe-hint")!;
const footer = document.querySelector<HTMLDivElement>("#footer")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copy")!;
const toast = document.querySelector<HTMLParagraphElement>("#toast")!;

let items: Item[] = [];
let activeId: string | null = null;
let scanController: AbortController | null = null;
let toastTimer = 0;
let nextId = 1;

takePhoto.addEventListener("click", () => cameraInput.click());
choosePhoto.addEventListener("click", () => libraryInput.click());
cameraInput.addEventListener("change", () => useInput(cameraInput));
libraryInput.addEventListener("change", () => useInput(libraryInput));
trySample.addEventListener("click", () => void loadSample());
clearButton.addEventListener("click", () => reset());
includeFormat.addEventListener("change", () => updateSheet());
copyButton.addEventListener("click", () => void copyList());
overlay.addEventListener("pointerdown", (event) => highlightFromPhoto(event));

function useInput(input: HTMLInputElement): void {
  const file = input.files?.[0];
  input.value = "";
  if (file) void loadFile(file);
}

async function loadSample(): Promise<void> {
  setStatus("Loading sample photo…");
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}sample.png`);
    if (!response.ok) throw new Error("Sample photo is missing.");
    const blob = await response.blob();
    await loadFile(new File([blob], "sample.png", { type: "image/png" }));
  } catch (error) {
    if (!isAbort(error)) showError(error);
  }
}

async function loadFile(file: File): Promise<void> {
  if (file.type && !file.type.startsWith("image/")) {
    showError(new Error("Choose a photo."));
    return;
  }
  scanController?.abort();
  const controller = new AbortController();
  scanController = controller;
  hideToast();
  items = [];
  activeId = null;
  renderList();
  results.hidden = true;
  footer.hidden = true;
  document.body.classList.remove("has-footer");

  setStatus("Opening photo…");
  progress.hidden = false;
  progressBar.style.width = "4%";

  try {
    const decoded = await decodeImage(file);
    try {
      paintPhoto(photo, decoded.source, decoded.width, decoded.height);
    } finally {
      decoded.close();
    }
    document.body.classList.add("has-photo");
    stage.hidden = false;
    drawOverlay([]);
    setStatus("Reading barcodes…");
    const foundItems = await scanPhoto(photo, {
      signal: controller.signal,
      onProgress: ({ done, total, found: foundCount }) => {
        const ratio = total === 0 ? 0 : done / total;
        progressBar.style.width = `${Math.round(ratio * 100)}%`;
        const noun = foundCount === 1 ? "barcode" : "barcodes";
        setStatus(
          foundCount
            ? `Reading the photo · ${foundCount} ${noun} so far`
            : "Reading the photo…",
        );
      },
      onPartial: (partial) => drawOverlay(partial.map((item, index) => ({ ...item, id: String(index), thumb: "" }))),
    });
    if (controller.signal.aborted) return;
    items = foundItems.map((item) => ({
      ...item,
      id: String(nextId++),
      thumb: thumbnail(photo, item),
    }));
    progress.hidden = true;
    progressBar.style.width = "0";
    if (items.length === 0) {
      results.hidden = true;
      footer.hidden = true;
      document.body.classList.remove("has-footer");
      setStatus("No barcodes found. Move closer, fill the frame with the labels, and keep the photo sharp.", true);
      drawOverlay([]);
      return;
    }
    statusEl.textContent = "";
    statusEl.classList.remove("is-error");
    results.hidden = false;
    footer.hidden = false;
    document.body.classList.add("has-footer");
    renderList();
    countEl.scrollIntoView({ block: "center" });
  } catch (error) {
    if (isAbort(error)) return;
    progress.hidden = true;
    showError(error);
  }
}

function renderList(): void {
  found.replaceChildren();
  items.forEach((item, index) => {
    const row = document.createElement("li");
    row.dataset.id = item.id;
    if (item.id === activeId) row.classList.add("is-active");

    const number = document.createElement("span");
    number.className = "n";
    number.textContent = String(index + 1);

    const image = document.createElement("img");
    image.className = "thumb";
    image.alt = "";
    image.src = item.thumb;

    const code = document.createElement("div");
    code.className = "code";
    const input = document.createElement("input");
    input.value = item.text;
    input.spellcheck = false;
    input.autocapitalize = "off";
    input.autocomplete = "off";
    input.setAttribute("autocorrect", "off");
    input.setAttribute("aria-label", `Barcode ${index + 1}`);
    input.addEventListener("input", () => {
      item.text = input.value;
      updateSheet();
    });
    input.addEventListener("focus", () => {
      setActive(item.id);
      window.setTimeout(() => input.scrollIntoView({ block: "center" }), 280);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.blur();
    });

    const format = document.createElement("span");
    format.className = "fmt";
    format.textContent = item.formatLabel;
    code.append(input, format);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.setAttribute("aria-label", `Remove barcode ${index + 1}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      items = items.filter((entry) => entry.id !== item.id);
      if (activeId === item.id) activeId = null;
      renderList();
    });

    row.addEventListener("click", (event) => {
      if (event.target === remove) return;
      setActive(item.id);
    });

    row.append(number, image, code, remove);
    found.append(row);
  });

  const count = items.length;
  countEl.innerHTML = count
    ? `<strong>${count}</strong> ${count === 1 ? "barcode" : "barcodes"}`
    : "No barcodes left";
  const texts = items.map((item) => cleanBarcodeText(item.text)).filter(Boolean);
  dupeHint.hidden = new Set(texts).size === texts.length;
  updateSheet();
  drawOverlay(items);
}

function updateSheet(): void {
  const rows = sheetRows();
  sheet.value = spreadsheetText(rows, includeFormat.checked);
  sheet.rows = Math.min(12, Math.max(4, rows.length));
  copyButton.disabled = rows.length === 0;
  copyButton.textContent = rows.length === 1 ? "Copy 1 barcode" : `Copy ${rows.length} barcodes`;
  sheetHint.textContent = includeFormat.checked
    ? "Two columns: barcode, then type. Paste into a spreadsheet."
    : "Each line pastes into its own row. A 12-digit UPC is listed with a 0 in front. Format the column as Text if a leading zero disappears.";
}

function sheetRows(): { text: string; formatLabel: string }[] {
  return items
    .map((item) => ({ text: cleanBarcodeText(item.text), formatLabel: item.formatLabel }))
    .filter((row) => row.text);
}

async function copyList(): Promise<void> {
  const rows = sheetRows();
  const text = spreadsheetText(rows, includeFormat.checked);
  if (!text) return;
  const html = spreadsheetHtml(rows, includeFormat.checked);
  try {
    if (window.isSecureContext && navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      showToast(rows.length === 1 ? "Copied 1 barcode" : `Copied ${rows.length} barcodes`);
      sheet.setSelectionRange(0, 0);
      sheet.blur();
      return;
    }
  } catch {
    // Fall through to plain text and the manual selection.
  }
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast(rows.length === 1 ? "Copied 1 barcode" : `Copied ${rows.length} barcodes`);
      sheet.setSelectionRange(0, 0);
      sheet.blur();
      return;
    }
  } catch {
    // Select the list so the phone's copy menu can take it from here.
  }
  sheet.focus();
  sheet.select();
  const copied = document.execCommand("copy");
  showToast(copied ? `Copied ${rows.length} barcodes` : "List selected. Tap Copy in the menu.");
}

function drawOverlay(list: Item[]): void {
  overlay.width = photo.width;
  overlay.height = photo.height;
  const context = overlay.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, overlay.width, overlay.height);
  const styles = getComputedStyle(document.documentElement);
  const boxColor = styles.getPropertyValue("--box").trim() || "#14382a";
  const activeColor = styles.getPropertyValue("--highlight").trim() || "#d86a1f";
  for (const item of list) {
    const x = item.box.x * overlay.width;
    const y = item.box.y * overlay.height;
    const width = item.box.width * overlay.width;
    const height = item.box.height * overlay.height;
    const color = item.id === activeId ? activeColor : boxColor;
    context.fillStyle = color;
    context.globalAlpha = 0.18;
    context.fillRect(x, y, width, height);
    context.globalAlpha = 1;
    context.lineWidth = Math.max(8, overlay.width / 90);
    context.strokeStyle = color;
    context.strokeRect(x, y, width, height);
  }
}

function highlightFromPhoto(event: PointerEvent): void {
  const rect = overlay.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  const match = [...items].reverse().find((item) => {
    const padX = Math.max(item.box.width * 0.08, 0.01);
    const padY = Math.max(item.box.height * 0.15, 0.01);
    return (
      x >= item.box.x - padX &&
      y >= item.box.y - padY &&
      x <= item.box.x + item.box.width + padX &&
      y <= item.box.y + item.box.height + padY
    );
  });
  if (!match) return;
  setActive(match.id);
  found.querySelector<HTMLElement>(`[data-id="${cssEscape(match.id)}"]`)?.scrollIntoView({ block: "center" });
}

function setActive(id: string): void {
  activeId = id;
  for (const row of found.querySelectorAll<HTMLElement>("li")) {
    row.classList.toggle("is-active", row.dataset.id === id);
  }
  drawOverlay(items);
}

function thumbnail(source: HTMLCanvasElement, item: ListedBarcode): string {
  const padX = item.box.width * 0.1;
  const padY = item.box.height * 0.16;
  const sx = clamp(source.width * (item.box.x - padX), 0, source.width - 1);
  const sy = clamp(source.height * (item.box.y - padY), 0, source.height - 1);
  const sw = clamp(source.width * (item.box.width + padX * 2), 1, source.width - sx);
  const sh = clamp(source.height * (item.box.height + padY * 2), 1, source.height - sy);
  const scale = Math.min(180 / sw, 96 / sh, 2);
  const thumb = document.createElement("canvas");
  thumb.width = Math.max(1, Math.round(sw * scale));
  thumb.height = Math.max(1, Math.round(sh * scale));
  const context = thumb.getContext("2d");
  if (!context) return "";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, thumb.width, thumb.height);
  context.drawImage(source, sx, sy, sw, sh, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL("image/jpeg", 0.72);
}

function reset(): void {
  scanController?.abort();
  items = [];
  activeId = null;
  stage.hidden = true;
  results.hidden = true;
  footer.hidden = true;
  progress.hidden = true;
  document.body.classList.remove("has-footer", "has-photo");
  statusEl.textContent = "";
  statusEl.classList.remove("is-error");
  hideToast();
  photo.width = 0;
  photo.height = 0;
}

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : "Could not read that photo.";
  setStatus(message, true);
}

function showToast(message: string): void {
  toast.hidden = false;
  toast.textContent = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, 2600);
}

function hideToast(): void {
  toast.hidden = true;
  toast.textContent = "";
}

async function decodeImage(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("Could not open that photo. Take it again with the camera button.");
    }
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cssEscape(value: string): string {
  return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/"/g, '\\"');
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
