import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { login, mockApi } from "./fixtures/app";
import { me, users } from "./fixtures/screenshots";

const API = "/api/v1";

/** Records what the console sends, so a check can assert the request rather
 *  than the optimistic UI — the table re-reads from /users either way. */
async function captureWrites(page: Page) {
  const writes: { method: string; url: string; body: unknown }[] = [];
  await page.route(new RegExp(`${API}/users/.+`), async (route) => {
    const post = route.request().postData();
    writes.push({
      method: route.request().method(),
      url: route.request().url().split("/").pop()!,
      body: post ? JSON.parse(post) : undefined,
    });
    await route.fulfill({ status: 204, body: "" });
  });
  return writes;
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("role is changed from the row, by keyboard alone", async ({ page }) => {
  await login(page);
  const writes = await captureWrites(page);
  await page.goto("/people");

  const role = page.getByRole("button", { name: "Role for Sgt. V. Kumar" });
  await role.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox", { name: "Role for Sgt. V. Kumar" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect.poll(() => writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ method: "PATCH", url: "kumar.v", body: { role: "admin" } });
  // Focus must come back to the trigger, or the next Tab starts from the body.
  await expect(role).toBeFocused();
});

test("escape closes the list without changing anything", async ({ page }) => {
  await login(page);
  const writes = await captureWrites(page);
  await page.goto("/people");

  const access = page.getByRole("button", { name: "Access for Cfn. S. Singh" });
  await access.click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");

  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(access).toBeFocused();
  expect(writes).toHaveLength(0);
});

test("your own role and access are locked", async ({ page }) => {
  await login(page);
  await page.goto("/people");

  // `me` is the admin fixture, so their row is the signed-in one.
  await expect(page.getByRole("button", { name: `Role for ${me.name}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Remove ${me.name}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Role for Sgt. V. Kumar" })).toBeVisible();
});

test("removing an account asks first, and names what is lost", async ({ page }) => {
  await login(page);
  const writes = await captureWrites(page);
  await page.goto("/people");

  await page.getByRole("button", { name: "Remove Sgt. V. Kumar" }).click();
  const dialog = page.getByRole("dialog", { name: /Remove Sgt. V. Kumar/ });
  await expect(dialog).toContainText("conversation");
  expect(writes).toHaveLength(0);

  await dialog.getByRole("button", { name: "Remove account" }).click();
  await expect.poll(() => writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ method: "DELETE", url: "kumar.v" });
});

test("a disabled account can be given access back", async ({ page }) => {
  await login(page);
  const writes = await captureWrites(page);
  await page.goto("/people");

  await page.getByRole("button", { name: "Restore access for Lt. R. Menon" }).click();
  await expect.poll(() => writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ method: "PATCH", url: "menon.r", body: { disabled: false } });
});

test("an analyst cannot reach the console", async ({ page }) => {
  // Same stubs, but signed in as someone without the admin role.
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...me, role: "user", name: users[1].name, subject: users[1].subject }),
    }),
  );
  await login(page);

  // Not offered in the sidebar…
  await expect(page.getByRole("link", { name: "Admin console" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "People" })).toHaveCount(0);
  // …and neither route is reachable by typing the URL either.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/chat$/);
  await page.goto("/people");
  await expect(page).toHaveURL(/\/chat$/);
});
