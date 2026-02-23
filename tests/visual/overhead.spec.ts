import { test, expect } from "@playwright/test";

test.describe("Visual Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the title screen to appear
    await expect(page.locator("h1")).toContainText("CURL.CLUB");
  });

  test("title screen", async ({ page }) => {
    await expect(page).toHaveScreenshot("title-screen.png", {
      fullPage: true,
    });
  });

  test("gameplay - aiming phase", async ({ page }) => {
    // Start the game
    await page.click("button:has-text('Start Game')");

    // Wait for aiming phase (rock icon or status text)
    await expect(page.locator("text=Tap to lock aim")).toBeVisible();

    // Take screenshot of the canvases
    const overheadCanvas = page.locator("canvas").nth(1);
    await expect(overheadCanvas).toHaveScreenshot("overhead-aiming.png");

    const perspectiveCanvas = page.locator("canvas").first();
    await expect(perspectiveCanvas).toHaveScreenshot("perspective-aiming.png");
  });

  test("full layout - aiming phase", async ({ page }) => {
    await page.click("button:has-text('Start Game')");
    await expect(page.locator("text=Tap to lock aim")).toBeVisible();

    // Full page screenshot showing both canvases
    await expect(page).toHaveScreenshot("full-layout-aiming.png", {
      fullPage: true,
    });
  });
});
