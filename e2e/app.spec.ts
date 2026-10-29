import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const expected = JSON.parse(
  readFileSync(new URL("../tests/fixtures/expected.json", import.meta.url), "utf8"),
) as { codes: string[] };

const list = expected.codes.join("\n");

test("reads a sheet of barcodes into a spreadsheet list", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Barcode list" })).toBeVisible();
  await expect(page.locator("#camera-input")).toHaveAttribute("capture", "environment");
  await expect(page.getByText("Photos stay on this phone")).toBeVisible();

  await page.getByRole("button", { name: "Try a sample photo" }).click();
  const sheet = page.locator("#sheet");
  await expect(sheet).toHaveValue(list);
  await expect(page.locator("#count")).toContainText(String(expected.codes.length));
  await expect(page.locator("#found input")).toHaveCount(expected.codes.length);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);

  const outlined = await page.locator("#overlay").evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext("2d");
    if (!context) return false;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 16) {
      if ((pixels[index] ?? 0) > 0) return true;
    }
    return false;
  });
  expect(outlined).toBe(true);

  await page.getByLabel("Include type").check();
  const withType = (await sheet.inputValue()).split("\n");
  expect(withType).toHaveLength(expected.codes.length);
  withType.forEach((line, index) => {
    const [code, type] = line.split("\t");
    expect(code).toBe(expected.codes[index]);
    expect(type?.length).toBeGreaterThan(0);
  });
  await page.getByLabel("Include type").uncheck();
  await expect(sheet).toHaveValue(list);

  await page.locator("#found input").nth(1).fill("EDITED-1");
  const edited = [...expected.codes];
  edited[1] = "EDITED-1";
  await expect(sheet).toHaveValue(edited.join("\n"));

  await page.getByRole("button", { name: "Remove barcode 2" }).click();
  edited.splice(1, 1);
  await expect(sheet).toHaveValue(edited.join("\n"));

  await page.getByRole("button", { name: `Copy ${edited.length} barcodes` }).click();
  await expect(page.locator("#toast")).toContainText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  if (copied) expect(copied).toBe(edited.join("\n"));
});
