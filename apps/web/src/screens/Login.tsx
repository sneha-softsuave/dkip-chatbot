import { KeyRound, Loader2, Shield, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Badge, Panel } from "../components/ui";
import { useAuth } from "../lib/auth";

const DEMO = [
  ["admin", "admin123", "Administrator"],
  ["analyst", "analyst123", "Analyst"],
  ["operator", "operator123", "Operator"],
];

export function Login() {
  const { login, loginWithKeycloak, keycloakConfigured } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
    } catch (err) {
      setError((err as Error).message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Product panel */}
        <div className="hidden flex-col justify-between border-r border-line bg-surface-1 p-12 lg:flex">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-accent" strokeWidth={1.6} />
            <div>
              <div className="text-lg font-semibold text-fg-hi">DKIP</div>
              <div className="text-xs text-fg-low">Defense Knowledge Intelligence Platform</div>
            </div>
          </div>
          <div className="max-w-lg">
            <h1 className="text-3xl font-semibold leading-tight text-fg-hi">
              Verified answers from your technical documentation
            </h1>
            <p className="mt-4 text-sm leading-6 text-fg-mid">
              DKIP retrieves and ranks passages from your organization&apos;s document library and
              generates answers backed by source citations. If the available documentation does not
              support a confident answer, the system declines rather than guessing.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Badge tone="signal">Hybrid search</Badge>
              <Badge tone="ok">Source-verified answers</Badge>
              <Badge tone="neutral">Full audit trail</Badge>
              <Badge tone="neutral">Role-based access control</Badge>
            </div>
          </div>
          <div className="text-xs text-fg-low">DKIP · Proof of Concept 1 · v1.0</div>
        </div>

        {/* Sign-in panel */}
        <div className="flex items-center justify-center p-6">
          <Panel className="w-full max-w-md p-8">
            <div className="mb-6 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <span className="eyebrow">Authorized access only</span>
            </div>
            <h2 className="text-xl font-semibold text-fg-hi">Sign in</h2>
            <p className="mt-1 text-sm text-fg-mid">Enter your credentials to access the platform.</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-mid">Username</label>
                <input className="field" value={username} autoFocus autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-mid">Password</label>
                <input className="field" type="password" value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
              </div>
              {error && (
                <div className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical">
                  {error}
                </div>
              )}
              <button type="submit" className="btn-primary w-full" disabled={busy || !username || !password}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {keycloakConfigured && (
              <button onClick={() => loginWithKeycloak().catch((e) => setError(e.message))}
                className="btn-ghost mt-3 w-full">
                Sign in with SSO
              </button>
            )}

            <div className="mt-6 border-t border-line pt-4">
              <div className="mb-2 text-xs font-medium text-fg-low">Demo accounts</div>
              <div className="grid gap-1.5">
                {DEMO.map(([u, p, r]) => (
                  <button key={u} onClick={() => { setUsername(u); setPassword(p); }}
                    className="flex items-center justify-between rounded-md border border-line bg-surface-1 px-3 py-1.5 text-left hover:border-accent/40">
                    <span className="font-mono text-xs text-fg-hi">{u} / {p}</span>
                    <span className="text-xs text-fg-low">{r}</span>
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
