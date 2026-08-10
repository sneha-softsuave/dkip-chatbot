import { FileText, GripVertical, Loader2, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { DocumentMeta, PlanQuestion, ReportPlan, PlanSection } from "../../lib/types";
import { Button, cx } from "../ui";
import { DocumentPicker } from "./DocumentPicker";

export interface PlanChoice {
  title: string;
  sections: PlanSection[];
  docIds: string[];
  answers: Record<string, string>;
}

function defaultAnswers(questions: PlanQuestion[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions) {
    out[q.id] = (q.options.find((o) => o.recommended) ?? q.options[0])?.id ?? "";
  }
  return out;
}

/**
 * What the agent proposes before spending a minute generating. Every question
 * arrives with a recommendation already selected, so "just generate it" is one
 * click and the choices are there for the user who cares.
 */
export function PlanCard({
  plan,
  docs,
  busy,
  onGenerate,
}: {
  plan: ReportPlan;
  docs: DocumentMeta[];
  busy: boolean;
  onGenerate: (choice: PlanChoice) => void;
}) {
  const [title, setTitle] = useState(plan.title);
  const [sections, setSections] = useState<PlanSection[]>(plan.sections);
  const [answers, setAnswers] = useState(() => defaultAnswers(plan.questions));
  const [docIds, setDocIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState("");

  const docsById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const usingPicked = answers.sources === "pick";
  const chosen = usingPicked ? docIds : [];

  function addSection() {
    const label = adding.trim();
    if (!label) return;
    setSections((s) => [...s, { key: `custom_${s.length}`, label, prompt: label }]);
    setAdding("");
  }

  function move(index: number, delta: number) {
    setSections((s) => {
      const next = [...s];
      const target = index + delta;
      if (target < 0 || target >= next.length) return s;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="surface-card p-5">
      <div className="section-title">Report plan</div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="field text-base font-semibold"
        aria-label="Report title"
      />

      {/* Outline */}
      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-fg-mid">Sections</div>
        <div className="space-y-1.5">
          {sections.map((s, i) => (
            <div key={s.key} className="group flex items-center gap-2 rounded-md border border-line bg-surface-1 px-3 py-2">
              <button
                onClick={() => move(i, -1)}
                className="text-fg-dim transition-colors hover:text-fg-hi"
                title="Move up"
                aria-label={`Move ${s.label} up`}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-0 flex-1 truncate text-sm text-fg-hi">{s.label}</span>
              <button
                onClick={() => setSections((all) => all.filter((x) => x.key !== s.key))}
                className="text-fg-dim opacity-0 transition-opacity hover:text-critical group-hover:opacity-100"
                title="Remove section"
                aria-label={`Remove ${s.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="field py-2 text-sm"
            placeholder="Add a section…"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSection()}
          />
          <Button variant="ghost" className="!px-3" onClick={addSection} aria-label="Add section">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Questions */}
      {plan.questions.map((q) => (
        <div key={q.id} className="mt-4">
          <div className="mb-2 text-xs font-medium text-fg-mid">{q.label}</div>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => (
              <button
                key={o.id}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                className={cx("chip text-xs", answers[q.id] === o.id && "chip-active")}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Documents — only when the user chose to pick them */}
      {usingPicked && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-fg-mid">Documents</div>
          <div className="flex flex-wrap items-center gap-2">
            {chosen.map((id) => {
              const d = docsById.get(id);
              return (
                <span key={id} className="chip text-xs">
                  <FileText className="h-3 w-3 text-fg-dim" />
                  {d?.doc_code ?? "document"}
                  <button
                    onClick={() => setDocIds((p) => p.filter((x) => x !== id))}
                    className="ml-1 text-fg-dim hover:text-critical"
                    aria-label="Remove document"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            <button className="chip text-xs" onClick={() => setPicking(true)}>
              <Plus className="h-3 w-3" /> Choose documents
            </button>
          </div>
          {plan.doc_candidates.length > 0 && chosen.length === 0 && (
            <p className="mt-2 text-[11px] text-fg-dim">
              Suggested: {plan.doc_candidates.slice(0, 3).map((d) => d.doc_code).join(" · ")}
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <Button
          disabled={busy || sections.length === 0 || (usingPicked && chosen.length === 0)}
          onClick={() => onGenerate({ title, sections, docIds: chosen, answers })}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? "Writing the report…" : "Generate report"}
        </Button>
        <span className="text-[11px] text-fg-dim">
          {usingPicked && chosen.length === 0
            ? "Choose at least one document"
            : "You can change anything afterwards by asking"}
        </span>
      </div>

      <DocumentPicker
        open={picking}
        selected={docIds}
        onClose={() => setPicking(false)}
        onConfirm={(ids) => {
          setDocIds(ids);
          setPicking(false);
        }}
      />
    </div>
  );
}
