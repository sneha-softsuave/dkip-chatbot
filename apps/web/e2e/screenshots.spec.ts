import { test, expect } from "@playwright/test";
import {
  auditEvents,
  collections,
  documents,
  fleetDashboard,
  health,
  ingestionJobs,
  loginResponse,
  me,
  provider,
  reportTemplates,
  users,
} from "./fixtures/screenshots";

const API = "/api/v1";

const routes = [
  { path: "/ask", name: "ask" },
  { path: "/sources", name: "sources" },
  { path: "/summarize", name: "summarize" },
  { path: "/reports", name: "reports" },
  { path: "/dashboards", name: "dashboards" },
  { path: "/ingestion", name: "ingestion" },
  { path: "/audit", name: "audit" },
  { path: "/admin", name: "admin" },
  { path: "/settings", name: "settings" },
];

function json(body: unknown) {
  return JSON.stringify(body);
}

test.beforeEach(async ({ page }) => {
  await page.route(`${API}/auth/login`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json(loginResponse) });
  });
  await page.route(`${API}/auth/me`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json(me) });
  });
  await page.route(`${API}/documents*`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json(documents) });
  });
  await page.route(`${API}/audit*`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json(auditEvents) });
  });
  await page.route(`${API}/collections`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json(collections) });
  });
  await page.route(`${API}/report-templates`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json(reportTemplates) });
  });
  await page.route(`${API}/ingestion/jobs`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json(ingestionJobs) });
  });
  await page.route(`${API}/dashboards/fleet`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json(fleetDashboard) });
  });
  await page.route(`${API}/health`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json(health) });
  });
  await page.route(`${API}/config/model-provider`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json(provider) });
  });
  await page.route(`${API}/users`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: json(users) });
  });

  await page.goto("/login");
  await page.getByPlaceholder("Enter your username").fill("admin");
  await page.getByPlaceholder("Enter your password").fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/ask", { timeout: 10000 });
});

for (const { path, name } of routes) {
  test(`screenshot ${name}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Allow skeletons / recharts animations to settle
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: false,
      maxDiffPixels: 500,
    });
  });
}
