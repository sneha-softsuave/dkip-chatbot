import { test, expect } from "@playwright/test";

import { login, mockApi } from "./fixtures/app";

const routes = [
  { path: "/chat", name: "chat" },
  { path: "/documents", name: "documents" },
  { path: "/reports", name: "reports" },
  { path: "/knowledge", name: "knowledge" },
  { path: "/admin", name: "admin" },
  { path: "/people", name: "people" },
];

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await login(page);
});

for (const { path, name } of routes) {
  test(`screenshot ${name}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Allow skeletons / chart animations to settle
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: false,
      maxDiffPixels: 500,
    });
  });
}
