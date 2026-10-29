import { fitSize, type Hit } from "./barcodes";

/** Matches the on-screen aiming box: centered, slightly above the middle. */
export const RETICLE = { x: 0.18, y: 0.3, width: 0.64, height: 0.32 };

export const LIVE_HOLD_MS = 800;

export type LiveGate = {
  previous: string | null;
  streak: number;
  locked: string | null;
  lockedAt: number;
  quietSince: number | null;
};

export function emptyGate(): LiveGate {
  return { previous: null, streak: 0, locked: null, lockedAt: 0, quietSince: null };
}

/**
 * Add a code once it has been aimed at on two frames.
 * Holding still does not add it again. A different code, or the same code
 * after the camera has moved off it, can be added after a short pause.
 */
export function gateScan(
  gate: LiveGate,
  text: string | null,
  now: number,
  holdMs = LIVE_HOLD_MS,
): { gate: LiveGate; add: boolean } {
  if (!text) {
    const quietSince = gate.quietSince ?? now;
    const expired = gate.locked !== null && now - quietSince >= holdMs;
    return {
      add: false,
      gate: {
        previous: null,
        streak: 0,
        locked: expired ? null : gate.locked,
        lockedAt: gate.lockedAt,
        quietSince,
      },
    };
  }

  const streak = gate.previous === text ? gate.streak + 1 : 1;
  const next = { previous: text, streak, quietSince: null as number | null };
  if (streak < 2) {
    return { add: false, gate: { ...gate, ...next } };
  }
  if (text === gate.locked) {
    return { add: false, gate: { ...gate, ...next, locked: text } };
  }
  if (gate.locked && now - gate.lockedAt < holdMs) {
    return { add: false, gate: { ...gate, ...next } };
  }
  return {
    add: true,
    gate: { ...next, locked: text, lockedAt: now },
  };
}

export function chooseAimedHit(hits: Hit[], width: number, height: number): Hit | null {
  const left = RETICLE.x * width;
  const top = RETICLE.y * height;
  const right = (RETICLE.x + RETICLE.width) * width;
  const bottom = (RETICLE.y + RETICLE.height) * height;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  let best: Hit | null = null;
  let bestDistance = Infinity;
  for (const hit of hits) {
    const center = hitCenter(hit);
    if (center.x < left || center.x > right || center.y < top || center.y > bottom) continue;
    const distance = (center.x - centerX) ** 2 + (center.y - centerY) ** 2;
    if (distance < bestDistance) {
      best = hit;
      bestDistance = distance;
    }
  }
  return best;
}

export function coverSourceRect(
  videoWidth: number,
  videoHeight: number,
  viewWidth: number,
  viewHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const viewAspect = viewWidth / viewHeight;
  const videoAspect = videoWidth / videoHeight;
  if (!Number.isFinite(viewAspect) || viewAspect <= 0 || videoWidth <= 0 || videoHeight <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(1, videoWidth), sh: Math.max(1, videoHeight) };
  }
  if (videoAspect > viewAspect) {
    const sw = videoHeight * viewAspect;
    return { sx: (videoWidth - sw) / 2, sy: 0, sw, sh: videoHeight };
  }
  const sh = videoWidth / viewAspect;
  return { sx: 0, sy: (videoHeight - sh) / 2, sw: videoWidth, sh };
}

export async function watchLiveVideo(options: {
  video: HTMLVideoElement;
  signal: AbortSignal;
  scan: (canvas: HTMLCanvasElement) => Promise<Hit[]>;
  onAimed: (hit: Hit | null) => void;
}): Promise<void> {
  const canvas = document.createElement("canvas");
  while (!options.signal.aborted) {
    const started = performance.now();
    const video = options.video;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      drawCover(video, canvas);
      try {
        const hits = canvas.width > 0 ? await options.scan(canvas) : [];
        if (options.signal.aborted) return;
        options.onAimed(chooseAimedHit(hits, canvas.width, canvas.height));
      } catch (error) {
        if (isAbort(error) || options.signal.aborted) return;
        options.onAimed(null);
      }
    }
    const pause = Math.max(0, 60 - (performance.now() - started));
    await sleep(pause);
  }
}

function drawCover(video: HTMLVideoElement, canvas: HTMLCanvasElement): void {
  const rect = video.getBoundingClientRect();
  const source = coverSourceRect(
    video.videoWidth,
    video.videoHeight,
    rect.width || video.videoWidth,
    rect.height || video.videoHeight,
  );
  const size = fitSize(source.sw, source.sh, 960, 960 * 960);
  canvas.width = Math.max(1, size.width);
  canvas.height = Math.max(1, size.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  context.drawImage(video, source.sx, source.sy, source.sw, source.sh, 0, 0, canvas.width, canvas.height);
}

function hitCenter(hit: Hit): { x: number; y: number } {
  const { topLeft, topRight, bottomLeft, bottomRight } = hit.position;
  return {
    x: (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4,
    y: (topLeft.y + topRight.y + bottomLeft.y + bottomRight.y) / 4,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
