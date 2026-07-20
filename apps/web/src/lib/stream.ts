import { api } from "./api";
import type { QueryResult } from "./types";

interface StreamHandlers {
  onMeta?: (m: { rewritten_query: string; provider: string }) => void;
  onToken?: (t: string) => void;
  onDone?: (r: QueryResult) => void;
  onError?: (e: string) => void;
}

/** POST /query/stream and parse the SSE event stream (§9.2). */
export async function streamQuery(
  body: { question: string; scope: unknown; session_id?: string },
  h: StreamHandlers,
) {
  try {
    const res = await fetch(`${api.base}/query/stream`, {
      method: "POST",
      headers: api.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      h.onError?.(`stream failed (${res.status})`);
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
        else if (evMatch[1] === "token") h.onToken?.(data.t);
        else if (evMatch[1] === "done") h.onDone?.(data);
      }
    }
  } catch (e) {
    h.onError?.((e as Error).message);
  }
}
