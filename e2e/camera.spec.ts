import bwipjs from "bwip-js";
import { expect, test } from "@playwright/test";

test.use({
  browserName: "chromium",
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test("shutter keeps each snap until the batch is read", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take photos" }).click();
  await expect(page.locator("#camera")).toBeVisible();
  const shutter = page.getByRole("button", { name: "Take photo", exact: true });
  await expect(shutter).toBeEnabled();
  await shutter.click();
  await expect(page.locator("#camera-count")).toHaveText("1 photo");
  await shutter.click();
  await expect(page.locator("#camera-count")).toHaveText("2 photos");
  await expect(page.locator("#results")).toBeHidden();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#camera")).toBeHidden();
  await expect(page.locator(".roll-shot")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Read 2 photos" })).toBeVisible();
  await expect(page.locator("#sheet")).toHaveValue("");
});

test("one at a time adds the aimed barcode once", async ({ page }) => {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text: "LIVE-1",
    scale: 4,
    height: 18,
    includetext: false,
  });
  await page.addInitScript((dataUrl: string) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 390;
      canvas.height = 844;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not draw the test barcode.");
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const width = 240;
      const height = (image.naturalHeight / image.naturalWidth) * width;
      context.drawImage(image, (canvas.width - width) / 2, 844 * 0.46 - height / 2, width, height);
      const stream = canvas.captureStream(8);
      (window as unknown as { __liveCanvas?: HTMLCanvasElement }).__liveCanvas = canvas;
      return stream;
    };
  }, `data:image/png;base64,${Buffer.from(png).toString("base64")}`);

  await page.goto("/");
  await page.getByRole("tab", { name: "One at a time" }).click();
  await page.getByRole("button", { name: "Start scanning" }).click();
  await expect(page.locator("#reticle")).toBeVisible();
  await expect(page.locator("#shutter")).toBeHidden();
  await expect(page.locator("#live-added")).toHaveText("LIVE-1");
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator("#camera")).toBeHidden();
  await expect(page.locator("#found input")).toHaveCount(1);
  await expect(page.locator("#sheet")).toHaveValue("LIVE-1");
});
