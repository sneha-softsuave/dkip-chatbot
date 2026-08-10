import { api } from "./api";
import type { TurnResult } from "./types";

export interface TurnStage {
  stage: "understanding" | "retrieving" | "reading" | "writing";
  count?: number;
}

interface TurnHandlers {
  onMeta?: (m: { intent: string }) => void;
  /** Progress frames from the pipeline, so the wait can say what it's doing. */
  onStage?: (s: TurnStage) => void;
  onToken?: (t: string) => void;
  onDone?: (r: TurnResult) => void;
  onError?: (e: string) => void;
}

/** POST /chat/turn and parse the SSE stream: meta → stage* → token* → done. */
export async function streamTurn(
  body: { session_id: string; message: string; scope?: unknown },
  h: TurnHandlers,
) {
  try {
    const res = await fetch(`${api.base}/chat/turn`, {
      method: "POST",
      headers: api.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      h.onError?.(`the assistant is unavailable right now (${res.status})`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const evMatch = frame.match(/event:\s*(\w+)/);
        const dataMatch = frame.match(/data:\s*(.*)/s);
        if (!evMatch || !dataMatch) continue;
        const data = JSON.parse(dataMatch[1]);
        if (evMatch[1] === "meta") h.onMeta?.(data);
        else if (evMatch[1] === "stage") h.onStage?.(data);
        else if (evMatch[1] === "token") h.onToken?.(data.t);
        else if (evMatch[1] === "done") h.onDone?.(data);
      }
    }
  } catch (e) {
    h.onError?.((e as Error).message);
  }
}
