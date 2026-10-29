import { describe, expect, it } from "vitest";
import type { Hit, Position } from "../src/barcodes";
import { chooseAimedHit, coverSourceRect, emptyGate, gateScan, RETICLE } from "../src/live";

function position(x: number, y: number, width: number, height: number): Position {
  return {
    topLeft: { x, y },
    topRight: { x: x + width, y },
    bottomLeft: { x, y: y + height },
    bottomRight: { x: x + width, y: y + height },
  };
}

function hit(text: string, x: number, y: number, width = 80, height = 30): Hit {
  return { text, format: "Code128", lineCount: 1, position: position(x, y, width, height) };
}

describe("live scan gate", () => {
  it("adds a code on the second steady frame and ignores it while it stays aimed", () => {
    let gate = emptyGate();
    let step = gateScan(gate, "LIVE-1", 0);
    expect(step.add).toBe(false);
    step = gateScan(step.gate, "LIVE-1", 100);
    expect(step.add).toBe(true);
    gate = step.gate;
    step = gateScan(gate, "LIVE-1", 400);
    expect(step.add).toBe(false);
    step = gateScan(step.gate, "LIVE-1", 2_000);
    expect(step.add).toBe(false);
  });

  it("does not add a one-frame misread", () => {
    let gate = emptyGate();
    gate = gateScan(gate, "LIVE-1", 0).gate;
    gate = gateScan(gate, "LIVE-1", 100).gate;
    const flicker = gateScan(gate, "NOISE", 200);
    expect(flicker.add).toBe(false);
    const back = gateScan(flicker.gate, "LIVE-1", 300);
    expect(back.add).toBe(false);
  });

  it("adds the next code after a short pause, and the same code again after moving off it", () => {
    let gate = emptyGate();
    gate = gateScan(gate, "A", 0).gate;
    gate = gateScan(gate, "A", 100).gate;
    gate = gateScan(gate, "B", 200).gate;
    const tooSoon = gateScan(gate, "B", 400);
    expect(tooSoon.add).toBe(false);
    const next = gateScan(tooSoon.gate, "B", 1_000);
    expect(next.add).toBe(true);

    let away = gateScan(next.gate, null, 1_100);
    away = gateScan(away.gate, null, 2_000);
    expect(away.gate.locked).toBe(null);
    const again = gateScan(gateScan(away.gate, "A", 2_100).gate, "A", 2_200);
    expect(again.add).toBe(true);
  });
});

describe("aiming box", () => {
  it("ignores a barcode outside the box and prefers the one nearest the middle", () => {
    const width = 1000;
    const height = 1000;
    const insideX = (RETICLE.x + RETICLE.width / 2) * width - 40;
    const insideY = (RETICLE.y + RETICLE.height / 2) * height - 15;
    const aimed = chooseAimedHit(
      [hit("EDGE", 0, 0), hit("NEAR", insideX + 30, insideY), hit("CENTER", insideX, insideY)],
      width,
      height,
    );
    expect(aimed?.text).toBe("CENTER");
  });

  it("crops a wide camera frame to the tall screen", () => {
    const crop = coverSourceRect(1920, 1080, 390, 700);
    expect(crop.sy).toBe(0);
    expect(crop.sh).toBe(1080);
    expect(crop.sw).toBeLessThan(1920);
    expect(crop.sx).toBeCloseTo((1920 - crop.sw) / 2);
  });
});
