import { cleanBarcodeText, fitSize, formatLabel, spreadsheetHtml, spreadsheetText, type Hit, type ListedBarcode } from "./barcodes";
import { emptyGate, gateScan, watchLiveVideo, type LiveGate } from "./live";
import { paintPhoto, scanFrame, scanPhoto } from "./scanner";

type Item = ListedBarcode & { id: string; thumb: string; shotId: string };

type Shot = {
  id: string;
  thumbUrl: string;
  imageBlob: Blob;
  status: "ready" | "done";
  items: Item[];
};

const lede = document.querySelector<HTMLParagraphElement>("#lede")!;
const modePhoto = document.querySelector<HTMLButtonElement>("#mode-photo")!;
const modeLive = document.querySelector<HTMLButtonElement>("#mode-live")!;
const startLive = document.querySelector<HTMLButtonElement>("#start-live")!;
const takePhoto = document.querySelector<HTMLButtonElement>("#take-photo")!;
const choosePhoto = document.querySelector<HTMLButtonElement>("#choose-photo")!;
const trySample = document.querySelector<HTMLButtonElement>("#try-sample")!;
const cameraInput = document.querySelector<HTMLInputElement>("#camera-input")!;
const libraryInput = document.querySelector<HTMLInputElement>("#library-input")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const progress = document.querySelector<HTMLDivElement>("#progress")!;
const progressBar = document.querySelector<HTMLDivElement>("#progress-bar")!;
const roll = document.querySelector<HTMLElement>("#roll")!;
const rollCount = document.querySelector<HTMLParagraphElement>("#roll-count")!;
const rollStrip = document.querySelector<HTMLDivElement>("#roll-strip")!;
const stage = document.querySelector<HTMLElement>("#stage")!;
const photo = document.querySelector<HTMLCanvasElement>("#photo")!;
const overlay = document.querySelector<HTMLCanvasElement>("#overlay")!;
const results = document.querySelector<HTMLElement>("#results")!;
const countEl = document.querySelector<HTMLParagraphElement>("#count")!;
const found = document.querySelector<HTMLOListElement>("#found")!;
const listHint = document.querySelector<HTMLParagraphElement>("#list-hint")!;
const liveClear = document.querySelector<HTMLButtonElement>("#live-clear")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear")!;
const includeFormat = document.querySelector<HTMLInputElement>("#include-format")!;
const sheet = document.querySelector<HTMLTextAreaElement>("#sheet")!;
const sheetHint = document.querySelector<HTMLParagraphElement>("#sheet-hint")!;
const dupeHint = document.querySelector<HTMLParagraphElement>("#dupe-hint")!;
const footer = document.querySelector<HTMLDivElement>("#footer")!;
const readButton = document.querySelector<HTMLButtonElement>("#read")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copy")!;
const toast = document.querySelector<HTMLParagraphElement>("#toast")!;
const camera = document.querySelector<HTMLDivElement>("#camera")!;
const viewfinder = document.querySelector<HTMLVideoElement>("#viewfinder")!;
const cameraFallback = document.querySelector<HTMLDivElement>("#camera-fallback")!;
const cameraApp = document.querySelector<HTMLButtonElement>("#camera-app")!;
const cameraCount = document.querySelector<HTMLParagraphElement>("#camera-count")!;
const torchButton = document.querySelector<HTMLButtonElement>("#torch")!;
const cameraDone = document.querySelector<HTMLButtonElement>("#camera-done")!;
const shutter = document.querySelector<HTMLButtonElement>("#shutter")!;
const cameraLast = document.querySelector<HTMLImageElement>("#camera-last")!;
const liveCopy = document.querySelector<HTMLButtonElement>("#live-copy")!;
const reticle = document.querySelector<HTMLDivElement>("#reticle")!;
const liveAdded = document.querySelector<HTMLParagraphElement>("#live-added")!;
const liveRecent = document.querySelector<HTMLOListElement>("#live-recent")!;
const cameraFallbackText = document.querySelector<HTMLParagraphElement>("#camera-fallback-text")!;

const PHOTO_LEDE = "Take as many photos as you need. When you are done, read every barcode into one list.";
const LIVE_LEDE = "Point at one barcode at a time so nothing gets skipped. Each code is added to the list as soon as it is read.";
const PHOTO_HINT = "Tap a barcode to highlight it on its photo. Fix a misread before you copy.";
const LIVE_HINT = "Each scan is one row. Fix a misread before you copy. The same code is added again only after you move off it.";

type Mode = "photo" | "live";

const shots: Shot[] = [];
let liveItems: Item[] = [];
let mode: Mode = "photo";
let cameraPurpose: Mode = "photo";
let liveGate: LiveGate = emptyGate();
let liveAbort: AbortController | null = null;
let activeId: string | null = null;
let visibleShotId: string | null = null;
let scanController: AbortController | null = null;
let toastTimer = 0;
let nextId = 1;
let reading = false;
let generation = 0;
let paintToken = 0;
let snapping = false;
let torchOn = false;
let hitTimer = 0;
let audio: AudioContext | null = null;

modePhoto.addEventListener("click", () => setMode("photo"));
modeLive.addEventListener("click", () => setMode("live"));
startLive.addEventListener("click", () => {
  primeAudio();
  void openCamera("live");
});
liveClear.addEventListener("click", () => clearLive());
liveCopy.addEventListener("click", () => void copyList());
takePhoto.addEventListener("click", () => void openCamera("photo"));
choosePhoto.addEventListener("click", () => libraryInput.click());
cameraInput.addEventListener("change", () => useInput(cameraInput));
libraryInput.addEventListener("change", () => useInput(libraryInput));
trySample.addEventListener("click", () => void loadSample());
clearButton.addEventListener("click", () => reset());
includeFormat.addEventListener("change", () => updateSheet());
readButton.addEventListener("click", () => void readAll());
copyButton.addEventListener("click", () => void copyList());
overlay.addEventListener("pointerdown", (event) => highlightFromPhoto(event));
cameraDone.addEventListener("click", () => closeCamera());
cameraApp.addEventListener("click", () => cameraInput.click());
shutter.addEventListener("click", () => void snapFrame());
torchButton.addEventListener("click", () => void toggleTorch());
for (const eventName of ["loadedmetadata", "loadeddata", "resize", "playing"] as const) {
  viewfinder.addEventListener(eventName, syncShutter);
}
window.addEventListener("pagehide", () => closeCamera());

function useInput(input: HTMLInputElement): void {
  const files = [...(input.files ?? [])];
  input.value = "";
  if (files.length) void addFiles(files);
}

async function loadSample(): Promise<void> {
  setStatus("Adding sample photo…");
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}sample.png`);
    if (!response.ok) throw new Error("Sample photo is missing.");
    await addFiles([await response.blob()]);
  } catch (error) {
    showError(error);
  }
}

async function addFiles(files: Blob[]): Promise<void> {
  const images = files.filter((file) => !file.type || file.type.startsWith("image/"));
  if (!images.length) {
    showError(new Error("Choose a photo."));
    return;
  }
  hideToast();
  let added = 0;
  for (let index = 0; index < images.length; index += 1) {
    const file = images[index];
    if (!file) continue;
    setStatus(images.length === 1 ? "Adding photo…" : `Adding photo ${index + 1} of ${images.length}…`);
    try {
      const shot = await prepareShot(file);
      shots.push(shot);
      added += 1;
      if (!camera.hidden) {
        cameraLast.hidden = false;
        cameraLast.src = shot.thumbUrl;
      }
      renderChrome();
    } catch (error) {
      showError(error);
    }
  }
  if (added && !reading) setReadyStatus();
}

async function prepareShot(file: Blob): Promise<Shot> {
  const decoded = await decodeImage(file);
  const size = fitSize(decoded.width, decoded.height);
  const canvas = document.createElement("canvas");
  try {
    paintPhoto(canvas, decoded.source, decoded.width, decoded.height);
  } finally {
    decoded.close();
  }
  return {
    id: String(nextId++),
    thumbUrl: photoThumb(canvas),
    imageBlob: size.scale < 1 ? await canvasToJpeg(canvas, 0.92) : file,
    status: "ready",
    items: [],
  };
}

function setMode(next: Mode): void {
  if (next === mode) return;
  closeCamera();
  if (reading) scanController?.abort();
  mode = next;
  activeId = null;
  modePhoto.setAttribute("aria-selected", String(next === "photo"));
  modeLive.setAttribute("aria-selected", String(next === "live"));
  document.body.classList.toggle("mode-photo", next === "photo");
  document.body.classList.toggle("mode-live", next === "live");
  lede.textContent = next === "live" ? LIVE_LEDE : PHOTO_LEDE;
  listHint.textContent = next === "live" ? LIVE_HINT : PHOTO_HINT;
  renderList();
  renderChrome();
  if (next === "photo") {
    if (visibleShotId) void showShot(visibleShotId);
    else setReadyStatus();
  } else {
    stage.hidden = true;
    setLiveStatus();
  }
}

async function openCamera(purpose: Mode): Promise<void> {
  if (!camera.hidden) return;
  cameraPurpose = purpose;
  camera.classList.toggle("is-live", purpose === "live");
  camera.hidden = false;
  document.body.classList.add("camera-open");
  cameraFallback.hidden = true;
  cameraApp.hidden = false;
  shutter.hidden = purpose === "live";
  shutter.disabled = true;
  reticle.hidden = purpose !== "live";
  liveAdded.hidden = purpose !== "live";
  if (purpose === "live") {
    liveAdded.textContent = liveItems.length ? liveItems[liveItems.length - 1]?.text ?? "Fill the box with one barcode" : "Fill the box with one barcode";
    cameraDone.textContent = "Stop";
  } else {
    cameraDone.textContent = "Done";
  }
  torchButton.hidden = true;
  torchOn = false;
  updateCameraCount();
  renderLiveRecent();
  if (!navigator.mediaDevices?.getUserMedia) {
    showCameraFallback();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: purpose === "live" ? 1920 : 2560 },
        height: { ideal: purpose === "live" ? 1080 : 1440 },
      },
    });
    if (camera.hidden) {
      stopStream(stream);
      return;
    }
    viewfinder.srcObject = stream;
    viewfinder.playsInline = true;
    viewfinder.muted = true;
    await viewfinder.play();
    syncShutter();
    if ("requestVideoFrameCallback" in viewfinder) {
      viewfinder.requestVideoFrameCallback(() => syncShutter());
    }
    const track = stream.getVideoTracks()[0];
    torchButton.hidden = !track || !supportsTorch(track);
    if (purpose === "live") startLiveLoop();
  } catch {
    showCameraFallback();
  }
}

function showCameraFallback(): void {
  stopLiveLoop();
  shutter.hidden = true;
  reticle.hidden = true;
  liveAdded.hidden = true;
  torchButton.hidden = true;
  cameraFallback.hidden = false;
  if (cameraPurpose === "live") {
    cameraFallbackText.textContent = "The live camera didn't open. One-at-a-time scanning needs the camera. Allow camera access in Safari, or use Photo roll.";
    cameraApp.hidden = true;
  } else {
    cameraFallbackText.textContent = "The live camera didn't open. Use the camera app instead. Each photo is kept here until you read the barcodes.";
    cameraApp.hidden = false;
  }
  const stream = viewfinder.srcObject;
  if (stream instanceof MediaStream) stopStream(stream);
  viewfinder.srcObject = null;
}

function closeCamera(): void {
  stopLiveLoop();
  const stream = viewfinder.srcObject;
  if (stream instanceof MediaStream) stopStream(stream);
  viewfinder.srcObject = null;
  torchOn = false;
  torchButton.setAttribute("aria-pressed", "false");
  torchButton.textContent = "Light";
  camera.hidden = true;
  camera.classList.remove("is-snapping", "is-hit");
  reticle.hidden = true;
  liveAdded.hidden = true;
  liveRecent.hidden = true;
  liveCopy.hidden = true;
  document.body.classList.remove("camera-open");
  renderChrome();
  if (cameraPurpose === "live") setLiveStatus();
}

function startLiveLoop(): void {
  stopLiveLoop();
  const controller = new AbortController();
  liveAbort = controller;
  void watchLiveVideo({
    video: viewfinder,
    signal: controller.signal,
    scan: (canvas) => scanFrame(canvas, controller.signal),
    onAimed: (hit) => noteLiveAim(hit),
  });
}

function stopLiveLoop(): void {
  liveAbort?.abort();
  liveAbort = null;
}

function noteLiveAim(hit: Hit | null): void {
  const decision = gateScan(liveGate, hit ? cleanBarcodeText(hit.text) : null, performance.now());
  liveGate = decision.gate;
  if (decision.add && hit) addLiveCode(hit);
}

function addLiveCode(hit: Hit): void {
  const text = cleanBarcodeText(hit.text);
  if (!text) return;
  liveItems.push({
    id: String(nextId++),
    text,
    format: hit.format,
    formatLabel: formatLabel(hit.format),
    box: { x: 0, y: 0, width: 0, height: 0 },
    thumb: "",
    shotId: "live",
  });
  liveAdded.hidden = false;
  liveAdded.textContent = text;
  camera.classList.add("is-hit");
  window.clearTimeout(hitTimer);
  hitTimer = window.setTimeout(() => camera.classList.remove("is-hit"), 450);
  beep();
  navigator.vibrate?.(40);
  renderList();
  renderChrome();
  setLiveStatus();
}

function clearLive(): void {
  liveItems = [];
  liveGate = emptyGate();
  activeId = null;
  liveAdded.textContent = "Fill the box with one barcode";
  renderList();
  renderChrome();
  setLiveStatus();
}

function setLiveStatus(): void {
  if (mode !== "live" || reading) return;
  const count = liveItems.length;
  if (!count) {
    statusEl.textContent = "";
    statusEl.classList.remove("is-error");
    return;
  }
  setStatus(count === 1 ? "1 barcode ready to copy." : `${count} barcodes ready to copy.`);
}

function primeAudio(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // The beep is optional.
  }
}

function beep(): void {
  try {
    const context = audio ?? new AudioContext();
    audio = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08);
    oscillator.stop(context.currentTime + 0.09);
  } catch {
    // A beep is only confirmation. The list still updates without it.
  }
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

async function snapFrame(): Promise<void> {
  if (snapping || viewfinder.videoWidth === 0) return;
  snapping = true;
  shutter.disabled = true;
  camera.classList.add("is-snapping");
  window.setTimeout(() => camera.classList.remove("is-snapping"), 120);
  try {
    const canvas = document.createElement("canvas");
    const size = fitSize(viewfinder.videoWidth, viewfinder.videoHeight);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not save that photo.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(viewfinder, 0, 0, size.width, size.height);
    const shot = {
      id: String(nextId++),
      thumbUrl: photoThumb(canvas),
      imageBlob: await canvasToJpeg(canvas, 0.92),
      status: "ready" as const,
      items: [],
    };
    shots.push(shot);
    cameraLast.hidden = false;
    cameraLast.src = shot.thumbUrl;
    renderChrome();
    if (!reading) setReadyStatus();
  } catch (error) {
    showError(error);
  } finally {
    snapping = false;
    syncShutter();
  }
}

async function toggleTorch(): Promise<void> {
  const track = cameraTrack();
  if (!track) return;
  const next = !torchOn;
  try {
    await track.applyConstraints({
      advanced: [{ torch: next } as MediaTrackConstraintSet],
    });
    torchOn = next;
    torchButton.textContent = torchOn ? "Light on" : "Light";
    torchButton.setAttribute("aria-pressed", String(torchOn));
  } catch {
    torchOn = false;
    torchButton.hidden = true;
  }
}

function syncShutter(): void {
  if (camera.hidden || shutter.hidden) return;
  shutter.disabled = snapping || viewfinder.videoWidth === 0;
}

function cameraTrack(): MediaStreamTrack | null {
  const stream = viewfinder.srcObject;
  if (!(stream instanceof MediaStream)) return null;
  return stream.getVideoTracks()[0] ?? null;
}

function supportsTorch(track: MediaStreamTrack): boolean {
  try {
    const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
    return caps.torch === true;
  } catch {
    return false;
  }
}

async function readAll(): Promise<void> {
  if (reading) return;
  const queue = shots.filter((shot) => shot.status === "ready");
  if (!queue.length) return;
  reading = true;
  const run = generation;
  scanController?.abort();
  const controller = new AbortController();
  scanController = controller;
  hideToast();
  progress.hidden = false;
  progressBar.style.width = "0";
  renderChrome();
  let failed = 0;
  let foundSoFar = currentItems().length;

  try {
    for (let index = 0; index < queue.length; index += 1) {
      const shot = queue[index];
      if (!shot || controller.signal.aborted || run !== generation) break;
      setStatus(progressLabel(index + 1, queue.length, foundSoFar));
      try {
        const decoded = await decodeImage(shot.imageBlob);
        if (controller.signal.aborted || run !== generation) {
          decoded.close();
          break;
        }
        try {
          paintPhoto(photo, decoded.source, decoded.width, decoded.height);
        } finally {
          decoded.close();
        }
        visibleShotId = shot.id;
        stage.hidden = false;
        document.body.classList.add("has-shots");
        const foundItems = await scanPhoto(photo, {
          signal: controller.signal,
          onProgress: ({ done, total, found }) => {
            const ratio = total === 0 ? 1 : done / total;
            const overall = (index + ratio) / queue.length;
            progressBar.style.width = `${Math.round(overall * 100)}%`;
            setStatus(progressLabel(index + 1, queue.length, foundSoFar + found));
          },
          onPartial: (partial) => {
            drawOverlay(
              partial.map((item) => ({
                ...item,
                id: `partial-${item.box.x}-${item.box.y}`,
                thumb: "",
                shotId: shot.id,
              })),
            );
          },
        });
        if (controller.signal.aborted || run !== generation) break;
        shot.items = foundItems.map((item) => ({
          ...item,
          id: String(nextId++),
          thumb: thumbnail(photo, item),
          shotId: shot.id,
        }));
        shot.status = "done";
        foundSoFar += shot.items.length;
        renderList();
      } catch (error) {
        if (isAbort(error) || run !== generation) break;
        failed += 1;
      }
    }
  } finally {
    if (run !== generation) return;
    reading = false;
    progress.hidden = true;
    progressBar.style.width = "0";
    renderList();
    renderChrome();
    if (failed) {
      setStatus(
        failed === 1
          ? "Couldn't read 1 photo. It is still ready — tap Read again."
          : `Couldn't read ${failed} photos. They are still ready — tap Read again.`,
        true,
      );
    } else {
      setReadyStatus();
    }
    if (currentItems().length) countEl.scrollIntoView({ block: "center" });
  }
}

function progressLabel(index: number, total: number, foundCount: number): string {
  const noun = foundCount === 1 ? "barcode" : "barcodes";
  return `Reading photo ${index} of ${total} · ${foundCount} ${noun} so far`;
}

function renderChrome(): void {
  const ready = mode === "photo" ? shots.filter((shot) => shot.status === "ready").length : 0;
  const showCopy = sheetRows().length > 0;
  const showRead = ready > 0;
  readButton.hidden = !showRead;
  copyButton.hidden = !showCopy;
  readButton.disabled = reading;
  readButton.textContent = reading ? "Reading…" : readLabel(ready);
  readButton.className = "btn primary";
  copyButton.className = showRead ? "btn secondary" : "btn primary";
  const showFooter = (showRead || showCopy) && camera.hidden;
  footer.hidden = !showFooter;
  document.body.classList.toggle("has-footer", showFooter);
  document.body.classList.toggle("has-both", showRead && showCopy);
  document.body.classList.toggle("has-shots", shots.length > 0);
  document.body.classList.toggle("has-live", mode === "live" && liveItems.length > 0);
  roll.hidden = mode !== "photo" || shots.length === 0;
  const photoNoun = shots.length === 1 ? "photo" : "photos";
  rollCount.innerHTML = shots.length ? `<strong>${shots.length}</strong> ${photoNoun}` : "";
  results.hidden = currentItems().length === 0;
  if (mode === "live") stage.hidden = true;
  liveCopy.hidden = camera.hidden || mode !== "live" || !showCopy;
  updateCameraCount();
  renderRoll();
  renderLiveRecent();
}

function readLabel(ready: number): string {
  const noun = ready === 1 ? "photo" : "photos";
  const reviewed = shots.some((shot) => shot.status === "done");
  return reviewed ? `Read ${ready} new ${noun}` : `Read ${ready} ${noun}`;
}

function updateCameraCount(): void {
  if (camera.hidden) return;
  if (cameraPurpose === "live") {
    const count = liveItems.length;
    cameraCount.textContent = count === 0 ? "Nothing scanned yet" : count === 1 ? "1 barcode" : `${count} barcodes`;
    return;
  }
  cameraCount.textContent =
    shots.length === 0 ? "No photos yet" : shots.length === 1 ? "1 photo" : `${shots.length} photos`;
}

function renderLiveRecent(): void {
  const show = cameraPurpose === "live" && !camera.hidden && liveItems.length > 0 && cameraFallback.hidden;
  liveRecent.hidden = !show;
  if (!show) return;
  liveRecent.replaceChildren();
  for (const item of [...liveItems].reverse()) {
    const row = document.createElement("li");
    row.textContent = item.text;
    liveRecent.append(row);
  }
}

function renderRoll(): void {
  rollStrip.replaceChildren();
  shots.forEach((shot, index) => {
    const item = document.createElement("div");
    item.className = "roll-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "roll-shot";
    if (shot.id === visibleShotId) button.classList.add("is-active");
    const detail = shot.status === "done" ? `${shot.items.length} barcodes` : "not read yet";
    button.disabled = reading;
    button.setAttribute("aria-label", `Photo ${index + 1}, ${detail}`);
    const image = document.createElement("img");
    image.alt = "";
    image.src = shot.thumbUrl;
    button.append(image);
    if (shot.status === "done") {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = String(shot.items.length);
      button.append(badge);
    }
    button.addEventListener("click", () => {
      if (!reading) void showShot(shot.id);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "roll-remove";
    remove.disabled = reading;
    remove.setAttribute("aria-label", `Remove photo ${index + 1}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => removeShot(shot.id));

    item.append(button, remove);
    rollStrip.append(item);
  });
}

function removeShot(id: string): void {
  const index = shots.findIndex((shot) => shot.id === id);
  if (index < 0) return;
  const removed = shots[index];
  shots.splice(index, 1);
  if (removed?.items.some((item) => item.id === activeId)) activeId = null;
  if (visibleShotId === id) {
    visibleShotId = shots[shots.length - 1]?.id ?? null;
    if (visibleShotId) void showShot(visibleShotId);
    else hideStage();
  }
  renderList();
  renderChrome();
  if (!reading) setReadyStatus();
}

async function showShot(id: string): Promise<void> {
  const shot = shots.find((entry) => entry.id === id);
  if (!shot || reading) return;
  const token = ++paintToken;
  visibleShotId = id;
  renderRoll();
  try {
    const decoded = await decodeImage(shot.imageBlob);
    if (token !== paintToken) {
      decoded.close();
      return;
    }
    try {
      paintPhoto(photo, decoded.source, decoded.width, decoded.height);
    } finally {
      decoded.close();
    }
  } catch (error) {
    if (token === paintToken) showError(error);
    return;
  }
  if (token !== paintToken) return;
  stage.hidden = false;
  document.body.classList.add("has-shots");
  drawOverlay(shot.items);
}

function renderList(): void {
  found.replaceChildren();
  const list = currentItems();
  list.forEach((item, index) => {
    const row = document.createElement("li");
    row.dataset.id = item.id;
    if (item.id === activeId) row.classList.add("is-active");

    if (!item.thumb) row.classList.add("no-thumb");

    const number = document.createElement("span");
    number.className = "n";
    number.textContent = String(index + 1);

    const image = document.createElement("img");
    image.className = "thumb";
    image.alt = "";
    if (item.thumb) image.src = item.thumb;

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
      renderChrome();
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
    format.textContent = formatLine(item);
    code.append(input, format);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.setAttribute("aria-label", `Remove barcode ${index + 1}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      if (item.shotId === "live") {
        liveItems = liveItems.filter((entry) => entry.id !== item.id);
      } else {
        const shot = shots.find((entry) => entry.id === item.shotId);
        if (shot) shot.items = shot.items.filter((entry) => entry.id !== item.id);
      }
      if (activeId === item.id) activeId = null;
      renderList();
      renderChrome();
      if (mode === "photo" && visibleShotId) drawOverlay(visibleItems());
      if (mode === "live") setLiveStatus();
    });

    row.addEventListener("click", (event) => {
      if (event.target === remove) return;
      setActive(item.id);
    });

    row.append(number, code, remove);
    if (item.thumb) row.insertBefore(image, code);
    found.append(row);
  });

  const count = list.length;
  countEl.innerHTML = count
    ? `<strong>${count}</strong> ${count === 1 ? "barcode" : "barcodes"}`
    : "No barcodes left";
  const texts = list.map((item) => cleanBarcodeText(item.text)).filter(Boolean);
  dupeHint.hidden = new Set(texts).size === texts.length;
  updateSheet();
  if (mode === "photo") drawOverlay(visibleItems());
}

function formatLine(item: Item): string {
  if (mode === "live" || shots.length < 2) return item.formatLabel;
  const index = shots.findIndex((shot) => shot.id === item.shotId);
  return `${item.formatLabel} · Photo ${index + 1}`;
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
  return currentItems()
    .map((item) => ({ text: cleanBarcodeText(item.text), formatLabel: item.formatLabel }))
    .filter((row) => row.text);
}

function currentItems(): Item[] {
  return mode === "live" ? liveItems : shots.flatMap((shot) => shot.items);
}

function visibleItems(): Item[] {
  return shots.find((shot) => shot.id === visibleShotId)?.items ?? [];
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
  const match = [...visibleItems()].reverse().find((item) => {
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
  const item = currentItems().find((entry) => entry.id === id);
  for (const row of found.querySelectorAll<HTMLElement>("li")) {
    row.classList.toggle("is-active", row.dataset.id === id);
  }
  if (mode !== "photo") return;
  if (item && item.shotId !== visibleShotId) {
    void showShot(item.shotId);
    return;
  }
  drawOverlay(visibleItems());
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

function photoThumb(source: HTMLCanvasElement): string {
  const maxEdge = 168;
  const scale = Math.min(maxEdge / source.width, maxEdge / source.height, 1);
  const thumb = document.createElement("canvas");
  thumb.width = Math.max(1, Math.round(source.width * scale));
  thumb.height = Math.max(1, Math.round(source.height * scale));
  const context = thumb.getContext("2d");
  if (!context) return "";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, thumb.width, thumb.height);
  context.drawImage(source, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL("image/jpeg", 0.7);
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not save that photo."))),
      "image/jpeg",
      quality,
    );
  });
}

function setReadyStatus(): void {
  if (mode !== "photo") return;
  const ready = shots.filter((shot) => shot.status === "ready");
  const done = shots.filter((shot) => shot.status === "done");
  const empty = done.filter((shot) => shot.items.length === 0).length;
  if (ready.length) {
    const noun = ready.length === 1 ? "photo" : "photos";
    const pronoun = ready.length === 1 ? "it" : "them";
    setStatus(
      done.length
        ? `${ready.length} new ${noun} ready.`
        : `${ready.length} ${noun} ready. Read ${pronoun} when you are done shooting.`,
    );
    return;
  }
  if (!done.length) return;
  if (!currentItems().length) {
    setStatus("No barcodes found. Move closer, fill the frame with the labels, and keep the photo sharp.", true);
    return;
  }
  if (empty) {
    setStatus(empty === 1 ? "1 photo had no barcodes." : `${empty} photos had no barcodes.`);
    return;
  }
  statusEl.textContent = "";
  statusEl.classList.remove("is-error");
}

function reset(): void {
  generation += 1;
  scanController?.abort();
  reading = false;
  closeCamera();
  shots.splice(0, shots.length);
  activeId = null;
  visibleShotId = null;
  paintToken += 1;
  progress.hidden = true;
  progressBar.style.width = "0";
  hideStage();
  hideToast();
  statusEl.textContent = "";
  statusEl.classList.remove("is-error");
  renderList();
  renderChrome();
}

function hideStage(): void {
  stage.hidden = true;
  photo.width = 0;
  photo.height = 0;
  overlay.width = 0;
  overlay.height = 0;
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

async function decodeImage(file: Blob): Promise<{
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
