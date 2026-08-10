import type { Page } from "@playwright/test";

import {
  answerTurn,
  generatedReport,
  planTurn,
  reportList,
  revisedReport,
  sse,
} from "./chat";
import {
  auditEvents,
  collections,
  docKinds,
  documents,
  health,
  ingestionJobs,
  loginResponse,
  me,
  provider,
  users,
} from "./screenshots";

const API = "/api/v1";

function json(body: unknown) {
  return JSON.stringify(body);
}

/** Every endpoint the app can touch, stubbed. */
export async function mockApi(page: Page) {
  const routeJson = (path: string, body: unknown) =>
    page.route(`${API}${path}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: json(body) }),
    );

  await routeJson("/auth/login", loginResponse);
  await routeJson("/auth/me", me);
  // Both list endpoints are paged now: { items, total, limit, offset }.
  await page.route(new RegExp(`${API}/documents(\\?.*)?$`), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: json({ items: documents, total: documents.length, limit: 25, offset: 0 }),
    }),
  );
  await routeJson("/collections", collections);
  await routeJson("/doc-kinds", docKinds);
  await routeJson("/ingestion/jobs", ingestionJobs);
  await routeJson("/health", health);
  await routeJson("/config/model-provider", provider);
  await routeJson("/users", users);
  await page.route(new RegExp(`${API}/audit(\\?.*)?$`), (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: json(auditEvents) }),
  );
  await page.route(new RegExp(`${API}/reports(\\?.*)?$`), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: json({ items: reportList, total: reportList.length, limit: 25, offset: 0 }),
    }),
  );
  // Opening prompts are drawn from the corpus rather than hardcoded in the UI.
  await routeJson("/chat/starters", {
    starters: [
      "What is the corrective procedure for hydraulic pressure loss?",
      "Generate a report on fleet serviceability",
      "What is the maximum winch line pull on the ARV-5?",
    ],
  });
  await routeJson("/reports/rep-1", generatedReport);

  // GET lists past conversations for the sidebar; POST opens a new one. Same
  // path, so the stub has to branch on method.
  await page.route(`${API}/chat/sessions`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: json([
            { id: "sess-1", title: "Fleet serviceability", created_at: "2026-07-21T09:00:00Z" },
            { id: "sess-2", title: "Winch line pull limits", created_at: "2026-07-20T14:12:00Z" },
          ]),
        })
      : route.fulfill({
          status: 201,
          contentType: "application/json",
          body: json({ id: "sess-1", title: "New chat" }),
        }),
  );
  // Resuming a conversation replays the cards each turn rendered.
  await routeJson("/chat/sessions/sess-1", {
    id: "sess-1",
    title: "Fleet serviceability",
    messages: [
      { id: "m1", role: "user", content: "Generate a report on fleet serviceability", meta: {} },
      {
        id: "m2",
        role: "assistant",
        content: generatedReport.title,
        meta: { kind: "report", report_id: "rep-1", ...generatedReport },
      },
    ],
    reports: [{ id: "rep-1", title: generatedReport.title, draft: generatedReport }],
  });
  await page.route(`${API}/reports/generate`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: json(generatedReport) }),
  );
  await page.route(`${API}/reports/rep-1/revise`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: json(revisedReport) }),
  );

  // /chat/turn: a report request returns a plan, a revision returns the updated
  // report, anything else answers the question.
  await page.route(`${API}/chat/turn`, async (route) => {
    const message = String(JSON.parse(route.request().postData() || "{}").message || "").toLowerCase();
    const isReport = /report|brief|write-?up/.test(message);
    const isRevision = /shorter|donut|chart|instead|change|add |remove /.test(message) && !isReport;
    const payload = isReport
      ? planTurn
      : isRevision
        ? { kind: "report", report_id: "rep-1", text: "Switched the chart to a donut.", ...revisedReport }
        : answerTurn;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse(payload, payload.kind === "answer" ? (answerTurn.answer as string) : ""),
    });
  });
}

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("admin123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/chat", { timeout: 10000 });
}
