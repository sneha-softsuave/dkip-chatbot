import { expect, test } from "@playwright/test";

import { login, mockApi } from "./fixtures/app";

/** The whole loop a user actually walks: ask → plan → generate → revise. */
test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await login(page);
});

const composer = "Ask a question, or ask for a report…";

test("answers a question with collapsible sources", async ({ page }) => {
  await page.getByPlaceholder(composer).fill("What is the corrective procedure for hydraulic pressure loss?");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Isolate the hydraulic circuit").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("2 sources")).toBeVisible();

  await page.getByText("2 sources").click();
  await expect(page.getByText("SOP-HYD-014").first()).toBeVisible();
  await expect(page).toHaveScreenshot("flow-1-answer.png", { maxDiffPixels: 500 });
});

test("asking for a report proposes a plan before generating", async ({ page }) => {
  await page.getByPlaceholder(composer).fill("Generate a report on fleet serviceability");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Report plan")).toBeVisible({ timeout: 10000 });
  // Recommended options arrive pre-selected so "just generate it" is one click.
  await expect(page.getByRole("button", { name: "Search all documents" })).toHaveClass(/chip-active/);
  await expect(page.getByRole("button", { name: "Bar — serviceable vs. total" })).toHaveClass(/chip-active/);
  await expect(page.getByRole("button", { name: "Standard", exact: true })).toHaveClass(/chip-active/);
  await expect(page.getByText("Bottom line")).toBeVisible();
  await expect(page).toHaveScreenshot("flow-2-plan.png", { maxDiffPixels: 500 });
});

test("choosing documents is required before generating from them", async ({ page }) => {
  await page.getByPlaceholder(composer).fill("Generate a report on fleet serviceability");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Report plan")).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Only documents I choose" }).click();
  await expect(page.getByRole("button", { name: /Generate report/ })).toBeDisabled();
  await expect(page.getByText("Choose at least one document")).toBeVisible();

  await page.getByRole("button", { name: "Choose documents" }).click();
  await page.getByRole("button", { name: /Operator Manual/ }).first().click();
  await page.getByRole("button", { name: "Use these documents" }).click();
  await expect(page.getByRole("button", { name: /Generate report/ })).toBeEnabled();
});

test("generates the report inline, then revises it in place", async ({ page }) => {
  await page.getByPlaceholder(composer).fill("Generate a report on fleet serviceability");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Report plan")).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: /Generate report/ }).click();
  await expect(page.getByRole("heading", { name: "Fleet serviceability — hydraulic systems" })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByText("recovery vehicles are serviceable").first()).toBeVisible();
  // Markdown from the model renders as formatting, not as asterisks on screen.
  await expect(page.locator(".prose-answer strong").first()).toBeVisible();
  await expect(page.locator(".prose-answer li").first()).toBeVisible();
  expect(await page.locator(".prose-answer").first().innerText()).not.toContain("**");
  await expect(page.getByText("From your equipment records.")).toBeVisible();
  await page.waitForTimeout(1200); // chart animation
  await expect(page).toHaveScreenshot("flow-3-report.png", { maxDiffPixels: 800 });

  await page.getByPlaceholder(composer).fill("use a donut chart instead");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Switched the chart to a donut.")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Fleet composition")).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page).toHaveScreenshot("flow-4-revised.png", { maxDiffPixels: 800 });
});

test("the report is an editable canvas in chat, read-only in the archive", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/v1/reports/rep-1", async (route) => {
    if (route.request().method() === "PATCH") {
      saved = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(saved) });
    } else {
      await route.fallback();
    }
  });

  await page.getByPlaceholder(composer).fill("Generate a report on fleet serviceability");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Report plan")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: /Generate report/ }).click();
  await expect(page.getByRole("heading", { name: "Fleet serviceability — hydraulic systems" })).toBeVisible({
    timeout: 10000,
  });

  // Markdown is rendered, not shown as punctuation.
  await expect(page.locator(".prose-answer strong").first()).toBeVisible();

  await page.getByRole("button", { name: /^Edit/ }).click();
  const body = page.getByRole("textbox", { name: /Text of Bottom line/ });
  await expect(body).toBeVisible();
  await body.fill("Edited by hand. Stock is **20 units** of **HF-2205** [S1].");
  await page.getByRole("textbox", { name: "Report title" }).fill("Hand-edited report");
  await page.getByRole("button", { name: /^Save/ }).click();

  await expect(page.getByRole("heading", { name: "Hand-edited report" })).toBeVisible();
  await expect(page.getByText("Edited by hand.")).toBeVisible();
  expect(saved, "the edit was not sent to the server").not.toBeNull();
  expect(JSON.stringify(saved)).toContain("Edited by hand");

  // The archive copy has no edit control — changes happen in the conversation.
  await page.goto("/reports/rep-1");
  await expect(page.getByRole("heading", { name: "Fleet serviceability — hydraulic systems" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Edit/ })).toHaveCount(0);
});

test("past reports open full page and link back to their chat", async ({ page }) => {
  await page.goto("/reports");
  await page.getByText("Fleet serviceability — hydraulic systems").click();
  await expect(page.getByRole("heading", { name: "Fleet serviceability — hydraulic systems" })).toBeVisible();
  // Editing happens only in chat — no revise control here.
  await expect(page.getByPlaceholder(composer)).toHaveCount(0);

  // Continue in chat reopens the conversation with the report still in it.
  await page.getByRole("button", { name: /Continue in chat/ }).click();
  await expect(page.getByText("Generate a report on fleet serviceability")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fleet serviceability — hydraulic systems" })).toBeVisible();
  await expect(page.getByPlaceholder(composer)).toBeVisible();
});

test("no technical internals are reachable from the UI", async ({ page }) => {
  const banned = /chunk|embedding|qdrant|opensearch|rerank|abstain|audit log|hash|latency|provider|SQL/i;
  for (const path of ["/chat", "/documents", "/reports", "/knowledge", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(text, `technical wording leaked on ${path}`).not.toMatch(banned);
  }
});
