/** Mocked chat/report payloads: the shapes /chat/turn and /reports/* return. */

export const evidence = [
  {
    sid: 1,
    chunk_id: "c1",
    doc_code: "SOP-HYD-014",
    title: "SOP — Hydraulic System Inspection",
    section: "4.2",
    page_start: 12,
    text: "Isolate the hydraulic circuit, bleed residual pressure at the test port, then replace the primary filter element before re-pressurising. The unit holds 27 vehicles in total.",
    score: 0.91,
    superseded: false,
  },
  {
    sid: 2,
    chunk_id: "c2",
    doc_code: "OM-VEH-001",
    title: "Operator Manual — ARV-5",
    section: "2.1",
    page_start: 3,
    text: "Under-pressure warnings on the ARV-5 indicate filter blockage in nine of ten recorded cases. Of the fleet, 22 are serviceable.",
    score: 0.74,
    superseded: false,
  },
];

export const citations = [
  { sid: 1, chunk_id: "c1", doc: "SOP-HYD-014", title: "SOP", section: "4.2", page: 12, superseded: false, revision: "A" },
  { sid: 2, chunk_id: "c2", doc: "OM-VEH-001", title: "Manual", section: "2.1", page: 3, superseded: false, revision: "B" },
];

export const answerTurn = {
  kind: "answer",
  answer:
    "Isolate the hydraulic circuit and bleed residual pressure at the test port before removing any component. Under-pressure warnings on the ARV-5 most often indicate a blocked primary filter, so replace the element and re-pressurise before further diagnosis.",
  answer_marked:
    "The corrective procedure is:\n\n" +
    "1. **Isolate the hydraulic circuit** and bleed residual pressure at the test port [S1].\n" +
    "2. Replace the primary filter element — under-pressure warnings most often mean a blockage [S2].\n" +
    "3. Re-pressurise and re-test before returning the vehicle to use [S1].",
  grounded: true,
  citations,
  evidence,
  suggestions: [],
};

export const planTurn = {
  kind: "plan",
  text: "Here's what I'd put in that report — adjust anything, then generate.",
  plan: {
    title: "Fleet serviceability — hydraulic systems",
    sections: [
      { key: "bluf", label: "Bottom line", prompt: "the bottom line up front" },
      { key: "findings", label: "Key findings", prompt: "the key findings" },
      { key: "actions", label: "Recommended actions", prompt: "recommended actions" },
    ],
    doc_candidates: [
      { doc_id: "doc-5", doc_code: "SOP-HYD-014", title: "SOP — Hydraulic System Inspection" },
      { doc_id: "doc-1", doc_code: "OM-VEH-001", title: "Operator Manual — ARV-5" },
    ],
    questions: [
      {
        id: "sources",
        label: "Which sources?",
        options: [
          { id: "auto", label: "Search all documents", recommended: true },
          { id: "pick", label: "Only documents I choose" },
        ],
      },
      {
        id: "chart",
        label: "Include a chart?",
        options: [
          { id: "bar", label: "Bar — serviceable vs. total", recommended: true },
          { id: "line", label: "Line — trend" },
          { id: "pie", label: "Donut — composition" },
          { id: "table", label: "Figures table" },
          { id: "none", label: "No chart" },
        ],
      },
      {
        id: "depth",
        label: "How detailed?",
        options: [
          { id: "brief", label: "Brief" },
          { id: "standard", label: "Standard", recommended: true },
          { id: "detailed", label: "Detailed" },
        ],
      },
    ],
  },
};

export const generatedReport = {
  id: "rep-1",
  title: "Fleet serviceability — hydraulic systems",
  session_id: "sess-1",
  created_at: "2026-07-22T09:00:00Z",
  question: "Generate a report on fleet serviceability",
  depth: "standard",
  sections: [
    {
      key: "bluf",
      label: "Bottom line",
      value: "Twenty-two of twenty-seven recovery vehicles are serviceable; the shortfall is concentrated in hydraulic filter blockages.",
      // Markdown, as the model now returns it — the renderer must show formatting,
      // not asterisks.
      value_marked:
        "**22 of 27** recovery vehicles are serviceable [S1]. The shortfall is concentrated in hydraulic filter blockages [S2].\n\n" +
        "- Replace the primary filter element before re-pressurising [S1]\n" +
        "- Hold **two spare elements** per vehicle at unit level [S2]",
      citations,
    },
    {
      key: "findings",
      label: "Key findings",
      value: "Under-pressure warnings indicate filter blockage in nine of ten recorded cases. Residual pressure must be bled at the test port before any component is removed.",
      value_marked:
        "Under-pressure warnings indicate filter blockage in nine of ten recorded cases [S2]. Residual pressure must be bled at the test port before any component is removed [S1].",
      citations,
    },
    {
      key: "actions",
      label: "Recommended actions",
      value: "Hold two spare filter elements per vehicle at unit level and re-inspect the five unserviceable vehicles.",
      value_marked:
        "Hold two spare filter elements per vehicle at unit level and re-inspect the five unserviceable vehicles [S1].",
      citations,
    },
  ],
  charts: [
    {
      type: "bar",
      title: "Serviceable vs. total by equipment",
      source: "records",
      series: ["serviceable", "total"],
      points: [
        { label: "ARV-5", serviceable: 7, total: 8 },
        { label: "5T Truck", serviceable: 6, total: 7 },
        { label: "Field Ambulance", serviceable: 6, total: 8 },
        { label: "Recovery Crane", serviceable: 3, total: 4 },
      ],
    },
  ],
};

export const revisedReport = {
  ...generatedReport,
  charts: [
    {
      type: "pie",
      title: "Fleet composition",
      source: "records",
      series: ["value"],
      points: [
        { label: "Serviceable", value: 22 },
        { label: "Unserviceable", value: 2 },
        { label: "Awaiting spares", value: 3 },
      ],
    },
  ],
};

export const reportList = [
  {
    id: "rep-1",
    title: "Fleet serviceability — hydraulic systems",
    session_id: "sess-1",
    created_at: "2026-07-22T09:00:00Z",
    sections: 3,
    sources: 2,
  },
  {
    id: "rep-2",
    title: "Winch assembly inspection digest",
    session_id: null,
    created_at: "2026-07-19T09:00:00Z",
    sections: 4,
    sources: 5,
  },
];

/** Build an SSE body for /chat/turn. */
export function sse(payload: Record<string, unknown>, tokens = "") {
  const frames = [`event: meta\ndata: ${JSON.stringify({ intent: payload.kind })}\n\n`];
  for (const word of tokens ? tokens.split(" ") : []) {
    frames.push(`event: token\ndata: ${JSON.stringify({ t: word + " " })}\n\n`);
  }
  frames.push(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
  return frames.join("");
}
