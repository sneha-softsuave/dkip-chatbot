import { test, expect } from "@playwright/test";

import { login, mockApi } from "./fixtures/app";

const theme = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));

const bodyBg = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("toggles between light and dark, and it is a real repaint", async ({ page }) => {
  await login(page);
  await page.goto("/admin");

  // Pinned dark by the config's colorScheme, so the app opens dark.
  expect(await theme(page)).toBe("dark");
  const dark = await bodyBg(page);

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  expect(await theme(page)).toBe("light");
  const light = await bodyBg(page);
  // Not just an attribute flip — the canvas actually recolours.
  expect(light).not.toBe(dark);
  // Light canvas is genuinely light (every channel high), dark genuinely dark.
  const chans = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number);
  expect(Math.min(...chans(light))).toBeGreaterThan(200);
  expect(Math.max(...chans(dark))).toBeLessThan(40);

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  expect(await theme(page)).toBe("dark");
});

test("the choice survives a reload", async ({ page }) => {
  await login(page);
  await page.goto("/people");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  expect(await theme(page)).toBe("light");

  await page.reload();
  // No flash back to dark: the inline script in index.html applies the stored
  // choice before the first paint.
  expect(await theme(page)).toBe("light");
  await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
});

test("a light-OS visitor with no saved choice gets light", async ({ page, context }) => {
  await context.clearCookies();
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.removeItem("dkip_theme"));
  await login(page);
  // First visit follows the OS preference.
  expect(await theme(page)).toBe("light");
});
