import { expect, test } from "./fixtures.ts";

test.describe("App scale", () => {
  test("updates the whole-app scale and keeps it after reload", async ({ page, zeno }) => {
    await expect.poll(() => page.evaluate(() => window.zeno.appearance.getAppScale())).toBe(100);

    await page.getByTestId("nav-settings").click();
    await page.getByTestId("settings-nav-appearance").click();
    const scaleControl = page.getByTestId("appearance-app-scale");
    await scaleControl.click();
    await page.getByRole("option", { name: "120%" }).click();

    await expect.poll(() => page.evaluate(() => window.zeno.appearance.getAppScale())).toBe(120);
    await expect
      .poll(() =>
        zeno.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor(),
        ),
      )
      .toBe(1.2);
    await expect(scaleControl).toContainText("120%");

    await page.reload();
    await page.waitForSelector('[data-testid="zeno-app"][data-bootstrap-ready="true"]', {
      timeout: 120_000,
    });
    await expect.poll(() => page.evaluate(() => window.zeno.appearance.getAppScale())).toBe(120);
    await expect
      .poll(() =>
        zeno.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor(),
        ),
      )
      .toBe(1.2);
  });
});
