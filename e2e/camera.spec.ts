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
