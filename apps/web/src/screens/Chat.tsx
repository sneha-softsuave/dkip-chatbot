import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Copy, CornerDownLeft, Loader2, Search, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { AnswerBody, EvidenceRail, stripPartialMarkers } from "../components/answer";
import { PageTransition } from "../components/PageTransition";
import { Gutter, provenanceOf, type Provenance } from "../components/ProvenanceGutter";
import { SourceViewer, type SourceTarget } from "../components/SourceViewer";
import { PlanCard, type PlanChoice } from "../components/chat/PlanCard";
import { ReportCard, type ReportCardData } from "../components/chat/ReportCard";
import { Button, Skeleton, cx } from "../components/ui";
import { api } from "../lib/api";
import { streamTurn, type TurnStage } from "../lib/stream";
import { useTheme } from "../lib/theme";
import type { Citation, ClarifyOption, DocumentMeta, Evidence, TurnResult } from "../lib/types";

/** Lazy so `three` stays out of the initial bundle — it is only ever needed
 *  on an empty conversation. */
const SignatureScene = lazy(() => import("../components/SignatureScene"));

interface Turn {
  question: string;
  text: string;
  streaming: boolean;
  stage?: TurnStage;
  result?: TurnResult;
  error?: string;
}

/** What the wait is actually doing. Shown instead of an undifferentiated spinner. */
function stageLabel(stage?: TurnStage): string {
  switch (stage?.stage) {
    case "retrieving":
      return "Searching your documents";
    case "reading":
      return stage.count ? `Reading ${stage.count} passage${stage.count === 1 ? "" : "s"}` : "Reading the passages";
    case "writing":
      return "Writing the answer";
    default:
      return "Working through your question";
  }
}

/** Shared width for thread + composer so their edges line up. */
const COLUMN = "mx-auto w-full max-w-[46rem]";

/**
 * Rebuild the transcript from stored messages. Each assistant turn saved the
 * card it rendered, so a resumed conversation shows the same answers, plans and
 * reports rather than a wall of plain text.
 */
function replayThread(messages: { role: string; content: string; meta?: TurnResult }[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      turns.push({ question: m.content, text: "", streaming: false });
    } else if (turns.length) {
      const last = turns[turns.length - 1];
      last.result = m.meta && m.meta.kind ? m.meta : { kind: "text", text: m.content };
    }
  }
  return turns;
}

export function Chat() {
  const theme = useTheme();
  const [message, setMessage] = useState("");
  const [thread, setThread] = useState<Turn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [target, setTarget] = useState<SourceTarget | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = thread.some((t) => t.streaming) || generating;

  const docs = useQuery<DocumentMeta[]>({
    queryKey: ["documents", "all"],
    queryFn: () => api.get("/documents?limit=200").then((r) => r.items),
  });

  // /chat/:sessionId reopens a conversation from the sidebar. ?session=… does
  // the same and is kept because saved reports link out that way; otherwise
  // start a fresh one.
  const qc = useQueryClient();
  const params = useParams<{ sessionId: string }>();
  const resumeId = params.sessionId ?? new URLSearchParams(useLocation().search).get("session");
  // Held as a promise, not just state: someone who types immediately must not
  // have their first message dropped because the session call hadn't landed.
  const sessionReady = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    let cancelled = false;
    sessionReady.current = (async () => {
      if (resumeId) {
        try {
          const s = await api.get(`/chat/sessions/${resumeId}`);
          if (!cancelled) {
            setSessionId(s.id);
            setThread(replayThread(s.messages ?? []));
          }
          return s.id as string;
        } catch {
          /* gone — fall through and start a new conversation */
        }
      }
      const s = await api.post("/chat/sessions", { title: "New chat" }).catch(() => null);
      if (s && !cancelled) setSessionId(s.id);
      return (s?.id as string) ?? null;
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  // Grow the composer with its content. Reset to auto first, or it can only
  // ever get taller as text is deleted.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [message]);

  function patchTurn(index: number, patch: Partial<Turn>) {
    setThread((t) => t.map((turn, i) => (i === index ? { ...turn, ...patch } : turn)));
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setMessage("");
    const idx = thread.length;
    setThread((t) => [...t, { question: q, text: "", streaming: true }]);
    const sid = sessionId ?? (await sessionReady.current);
    if (!sid) {
      patchTurn(idx, { streaming: false, error: "Couldn't start the conversation. Please reload." });
      return;
    }
    await streamTurn(
      { session_id: sid, message: q },
      {
        onStage: (stage) => patchTurn(idx, { stage }),
        onToken: (tok) => setThread((t) => t.map((turn, i) => (i === idx ? { ...turn, text: turn.text + tok } : turn))),
        onDone: (r) => {
          patchTurn(idx, {
            streaming: false,
            result: r,
            error: r.kind === "error" ? r.text : undefined,
          });
          // The server titles a session from its first turn, so the sidebar's
          // Recent list only becomes correct once a turn has landed.
          if (idx === 0) qc.invalidateQueries({ queryKey: ["chat-sessions"] });
        },
        onError: (e) => patchTurn(idx, { streaming: false, error: e }),
      },
    );
  }

  /** Plan → report. The generated card replaces the plan in that same turn. */
  async function generate(index: number, choice: PlanChoice) {
    const turn = thread[index];
    const plan = turn.result?.plan;
    if (!plan) return;
    const sid = sessionId ?? (await sessionReady.current);
    setGenerating(true);
    try {
      const report = await api.post("/reports/generate", {
        question: turn.question,
        title: choice.title,
        sections: choice.sections,
        scope: choice.docIds.length ? { doc_ids: choice.docIds } : {},
        depth: choice.answers.depth ?? "standard",
        chart: choice.answers.chart ?? "none",
        session_id: sid,
      });
      patchTurn(index, {
        result: {
          kind: "report",
          report_id: report.id,
          title: report.title,
          sections: report.sections,
          charts: report.charts,
        },
      });
    } catch (e) {
      patchTurn(index, { error: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <PageTransition>
      <div className="relative flex h-full flex-col">
        {/* Ambient wireframe — DARK only. The scene is drawn with additive
            blending and its hard lines read as scattered boxes on a white canvas,
            so light leans on the shell's soft gradient-mesh glow instead. A veil
            keeps the centre reading column on solid canvas so text never lands on
            geometry, and it dims once there is a conversation to read. */}
        {theme === "dark" && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <Suspense fallback={null}>
              <SignatureScene
                className="h-full w-full"
                spread={2.6}
                intensity={thread.length ? 0.55 : 1.3}
              />
            </Suspense>
            <div className={cx("absolute inset-0", thread.length ? "chat-veil-active" : "chat-veil-empty")} />
          </div>
        )}

        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
          {thread.length === 0 ? (
            <EmptyState onPick={send} />
          ) : (
            <div className={cx(COLUMN, "space-y-10 pb-10 pt-8")}>
              {thread.map((turn, i) => (
                <TurnView
                  key={i}
                  turn={turn}
                  docs={docs.data ?? []}
                  generating={generating}
                  onGenerate={(choice) => generate(i, choice)}
                  onOpenCitation={(c) => setTarget({ chunkId: c.chunk_id })}
                  onOpenEvidence={(e) => setTarget({ chunkId: e.chunk_id })}
                  onSuggestion={send}
                  onReportSaved={(saved) =>
                    patchTurn(i, { result: { ...turn.result!, ...saved } })
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Outside the scroll container, so the composer is always reachable
            without scrolling to the bottom of a long conversation. */}
        <div className="relative shrink-0 border-t border-line bg-bg px-6 pb-5 pt-4">
          <div className={COLUMN}>
            <div className="composer glass">
              {/* h-[1.625rem] is exactly one `text-prose` line box, so the caret
                  sits on the text baseline instead of floating in a taller box.
                  Grows with the content up to max-h-40. */}
              <textarea
                ref={inputRef}
                className="max-h-40 min-h-[1.625rem] flex-1 resize-none self-center bg-transparent py-1 text-prose leading-relaxed text-fg-hi outline-none placeholder:text-fg-dim"
                rows={1}
                value={message}
                placeholder="Ask a question, or ask for a report…"
                aria-label="Message"
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(message);
                  }
                }}
              />
              <Button
                disabled={busy || !message.trim()}
                onClick={() => send(message)}
                aria-label="Send"
                className="!px-2.5 !py-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-2 text-label text-fg-dim">Enter to send · Shift+Enter for a new line</p>
          </div>
        </div>

        <SourceViewer target={target} onClose={() => setTarget(null)} />
      </div>
    </PageTransition>
  );
}

function TurnView({
  turn,
  docs,
  generating,
  onGenerate,
  onOpenCitation,
  onOpenEvidence,
  onSuggestion,
  onReportSaved,
}: {
  turn: Turn;
  docs: DocumentMeta[];
  generating: boolean;
  onGenerate: (choice: PlanChoice) => void;
  onOpenCitation: (c: Citation) => void;
  onOpenEvidence: (e: Evidence) => void;
  onSuggestion: (q: string) => void;
  onReportSaved: (saved: ReportCardData) => void;
}) {
  const r = turn.result;
  const still = useReducedMotion();
  const answered = r?.kind === "answer";
  // An abstention is the one case worth marking loudly; everything else either
  // carries citations or makes no claim at all.
  const tone: Provenance = turn.error
    ? "critical"
    : answered
      ? provenanceOf({ grounded: r.grounded, citations: r.citations })
      : "idle";

  return (
    <motion.div
      initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="group/turn space-y-5"
    >
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-br-sm border border-line bg-surface-2 px-4 py-2.5 text-prose text-fg-hi">
          {turn.question}
        </div>
      </div>

      <Gutter tone={tone} className="min-w-0">
        {turn.error ? (
          <p className="text-prose text-critical">{turn.error}</p>
        ) : turn.streaming && !r ? (
          <Thinking text={turn.text} stage={turn.stage} />
        ) : r?.kind === "plan" && r.plan ? (
          <div className="space-y-4">
            {r.text && <p className="text-prose text-fg-hi">{r.text}</p>}
            <PlanCard plan={r.plan} docs={docs} busy={generating} onGenerate={onGenerate} />
          </div>
        ) : r?.kind === "report" ? (
          <div className="space-y-4">
            {r.text && <p className="text-prose text-fg-hi">{r.text}</p>}
            <ReportCard data={r} onOpenCitation={onOpenCitation} editable onSaved={onReportSaved} />
          </div>
        ) : r?.kind === "clarify" ? (
          <ClarifyCard result={r} onPick={onSuggestion} />
        ) : answered && r.grounded ? (
          <>
            <AnswerBody
              marked={r.answer_marked || r.answer || ""}
              citations={r.citations ?? []}
              evidence={r.evidence ?? []}
              onOpen={onOpenCitation}
            />
            <SourcesBlock result={r} onOpenCitation={onOpenCitation} onOpenEvidence={onOpenEvidence} />
            <div className="mt-1 -ml-2 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover/turn:opacity-100">
              <CopyButton text={r.answer_marked || r.answer || ""} />
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-prose text-fg-mid">
              {r?.text ?? "I couldn't find this in your documents. Try rephrasing, or name the document to look in."}
            </p>
            {(r?.suggestions ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {r!.suggestions!.map((s) => (
                  <button key={s} className="chip" onClick={() => onSuggestion(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Gutter>
    </motion.div>
  );
}

/**
 * The reply as it arrives. Markers are stripped while streaming — including a
 * half-arrived `[S1` at the tail — so the raw citation syntax never flickers on
 * screen before the finished answer replaces this with rendered chips.
 */

/**
 * Copy an assistant reply. The `[Sn]` markers are UI affordances — they are
 * links to a source viewer, not something anyone wants in a pasted paragraph —
 * so they come out on the way to the clipboard.
 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const clean = stripPartialMarkers(text).replace(/\s+([.,;:])/g, "$1").trim();
    try {
      await navigator.clipboard.writeText(clean);
    } catch {
      // clipboard API needs a secure context; fall back so http:// deployments
      // and older browsers still copy.
      const ta = document.createElement("textarea");
      ta.value = clean;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy reply"}
      title={copied ? "Copied" : "Copy reply"}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-label text-fg-dim transition-colors duration-fast hover:bg-surface-2 hover:text-fg-hi"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * The agent needs one more detail before it can act. The options come from the
 * server, already validated against what this report can accept, so picking one
 * always succeeds — it is sent as an ordinary message and handled by the normal
 * turn loop.
 */
function ClarifyCard({ result, onPick }: { result: TurnResult; onPick: (v: string) => void }) {
  const options: ClarifyOption[] = result.options ?? [];
  return (
    <div className="space-y-3">
      <p className="text-prose text-fg-hi">{result.text}</p>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button key={o.value} onClick={() => onPick(o.value)} className="chip">
              {o.swatch && (
                <span
                  className="h-3 w-3 shrink-0 rounded-sm border border-white/20"
                  style={{ background: o.swatch }}
                  aria-hidden
                />
              )}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Thinking({ text, stage }: { text: string; stage?: TurnStage }) {
  const partial = stripPartialMarkers(text);
  // Before the first token there is nothing to read, so say what the system is
  // actually doing and show the shape of the answer that's coming. Once tokens
  // arrive a caret is enough to say "still going".
  if (!partial) {
    const label = stageLabel(stage);
    return (
      <div className="space-y-3" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-body text-fg-low">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          <span>{label}</span>
          <span className="inline-flex gap-0.5" aria-hidden>
            <span className="h-1 w-1 animate-bounce rounded-full bg-fg-dim" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-fg-dim [animation-delay:120ms]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-fg-dim [animation-delay:240ms]" />
          </span>
        </div>
        <Skeleton className="h-3.5 w-[90%]" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-[65%]" />
      </div>
    );
  }
  return (
    <p className="whitespace-pre-wrap text-prose text-fg-hi">
      {partial}
      <span className="ml-0.5 inline-block h-4 w-0.5 -translate-y-px bg-fg-low align-middle motion-safe:animate-caret" />
    </p>
  );
}

/** Quiet footer under an answer; expands to the passages it was built from. */
function SourcesBlock({
  result,
  onOpenCitation,
  onOpenEvidence,
}: {
  result: TurnResult;
  onOpenCitation: (c: Citation) => void;
  onOpenEvidence: (e: Evidence) => void;
}) {
  const [open, setOpen] = useState(false);
  const evidence = result.evidence ?? [];
  const citations = result.citations ?? [];
  const count = evidence.length;
  const outdated = citations.some((c) => c.superseded);

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-label text-fg-dim transition-colors duration-fast hover:text-fg-hi"
      >
        <ChevronRight className={cx("h-3 w-3 transition-transform duration-fast", open && "rotate-90")} aria-hidden />
        <span>
          Traced to {count} source{count === 1 ? "" : "s"}
        </span>
        {outdated && <span className="text-caution">· a newer version of a source exists</span>}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3">
              {count > 0 && <EvidenceRail evidence={evidence} onOpen={onOpenEvidence} />}
              <div className="flex flex-wrap gap-2">
                {citations.map((c) => (
                  <button key={c.chunk_id} onClick={() => onOpenCitation(c)} className="chip">
                    <span className="font-mono text-micro text-fg-dim">{c.sid}</span>
                    <span>
                      {c.doc} §{c.section} p.{c.page}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The one 3D moment inside the app. It sits behind the opening question and
 * disappears the moment a conversation starts, so it never competes with
 * something the user is trying to read.
 */
/**
 * Starters are drawn from the corpus this user can see, so the opening prompts
 * are answerable. They were a hardcoded trio naming equipment the library might
 * not even hold.
 */
function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const starters = useQuery<{ starters: string[] }>({
    queryKey: ["chat-starters"],
    queryFn: () => api.get("/chat/starters"),
    staleTime: 5 * 60_000,
  });
  const items = starters.data?.starters ?? [];

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-2xl text-center">
        <div className="mx-auto mb-5 grid h-10 w-10 place-items-center rounded-xl border border-accent/25 bg-accent-surface text-accent shadow-glow">
          <Sparkles className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </div>
        <h2 className="text-h1 text-fg-hi">What do you want to know?</h2>
        <p className="mx-auto mt-2 max-w-md text-body text-fg-low">
          Ask about your documents, or ask for a report. Every answer is traced back to the passage
          it came from — and when the documents can't support one, you get told so.
        </p>

        {/* No placeholder bars while these load. They are optional garnish, not
            the content — empty slabs under the heading read as broken for the
            second before the real prompts arrive. Nothing, then a quiet fade-in. */}
        {items.length > 0 && (
          <div className="mx-auto mt-8 flex max-w-xl flex-col gap-2.5 motion-safe:animate-rise">
            {items.map((q) => (
              <button key={q} onClick={() => onPick(q)} className="starter-card glass group">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/20 bg-accent-surface text-accent">
                  <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="flex-1 text-body text-fg-mid transition-colors group-hover:text-fg-hi">{q}</span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-fg-dim transition-[transform,color] duration-normal group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
