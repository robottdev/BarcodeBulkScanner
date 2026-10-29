import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let child: ChildProcess | undefined;
let directory: string | undefined;
let port = 0;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "barcode-server-"));
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "index.html"), "<!doctype html><title>Barcode list</title>");
  await writeFile(join(directory, "assets", "app.js"), "export const ready = true;\n");
  await writeFile(join(directory, "assets", "reader.wasm"), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PORT: "0", STATIC_ROOT: directory },
    stdio: ["ignore", "pipe", "pipe"],
  });
  port = await waitForPort(child);
});

afterEach(async () => {
  child?.kill();
  child = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("production server", () => {
  it("serves the page, wasm, and health check on the assigned port", async () => {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("Barcode list");

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    expect(await health.text()).toBe("ok");

    const script = await fetch(`http://127.0.0.1:${port}/assets/app.js`);
    expect(script.headers.get("content-type")).toContain("javascript");
    expect(script.headers.get("cache-control")).toContain("immutable");

    const wasm = await fetch(`http://127.0.0.1:${port}/assets/reader.wasm`);
    expect(wasm.status).toBe(200);
    expect(wasm.headers.get("content-type")).toBe("application/wasm");

    const missing = await fetch(`http://127.0.0.1:${port}/does-not-exist`);
    expect(missing.status).toBe(200);
    expect(await missing.text()).toContain("Barcode list");

    const missingAsset = await fetch(`http://127.0.0.1:${port}/assets/missing.js`);
    expect(missingAsset.status).toBe(404);

    const secret = await fetch(`http://127.0.0.1:${port}/../package.json`);
    expect(await secret.text()).not.toContain("barcode-bulk-scanner");
  });
});

function waitForPort(childProcess: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;
    const finish = (error?: Error, value?: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? 0);
    };
    const timer = setTimeout(() => finish(new Error(`Server did not start:\n${output}`)), 10_000);
    childProcess.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/Listening on (\d+)/);
      if (match?.[1]) finish(undefined, Number(match[1]));
    });
    childProcess.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    childProcess.on("exit", (code) => {
      finish(new Error(`Server exited ${code}:\n${output}`));
    });
  });
}
