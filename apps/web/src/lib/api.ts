const BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

let tokenGetter: () => string | null = () => localStorage.getItem("dkip_token");

export function setTokenGetter(fn: () => string | null) {
  tokenGetter = fn;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const t = tokenGetter();
  return t ? { Authorization: `Bearer ${t}`, ...extra } : extra;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle(res: Response) {
  if (res.ok) {
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res;
  }
  let message = res.statusText;
  try {
    const body = await res.json();
    message = body?.error?.message || message;
  } catch {
    /* non-json */
  }
  throw new ApiError(res.status, message);
}

export const api = {
  base: BASE,
  async get(path: string) {
    return handle(await fetch(`${BASE}${path}`, { headers: authHeaders() }));
  },
  async post(path: string, body?: unknown) {
    return handle(
      await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  },
  async patch(path: string, body?: unknown) {
    return handle(
      await fetch(`${BASE}${path}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  },
  async put(path: string, body?: unknown) {
    return handle(
      await fetch(`${BASE}${path}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  },
  async del(path: string) {
    return handle(await fetch(`${BASE}${path}`, { method: "DELETE", headers: authHeaders() }));
  },
  async upload(path: string, form: FormData) {
    return handle(await fetch(`${BASE}${path}`, { method: "POST", headers: authHeaders(), body: form }));
  },
  fileUrl(path: string) {
    return `${BASE}${path}`;
  },
  authHeaders,
};
