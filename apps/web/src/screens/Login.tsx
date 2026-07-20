import { Crosshair, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { ClassificationBanner } from "../components/ClassificationBanner";
import { Badge, Panel } from "../components/ui";
import { useAuth } from "../lib/auth";

const DEMO = [
  ["admin", "admin123", "Admin · CLR-4"],
  ["analyst", "analyst123", "User · CLR-2"],
  ["operator", "operator123", "User · CLR-1"],
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
      <ClassificationBanner text="UNCLASSIFIED // FOR DEMONSTRATION" edge="top" />
      <div className="grid min-h-0 flex-1 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Identity / thesis panel */}
        <div className="relative hidden overflow-hidden border-r border-line lg:flex lg:flex-col lg:justify-between lg:p-12">
          <div className="pointer-events-none absolute inset-0 opacity-[0.5]">
            <div className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-signal/10" />
            <div className="absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-signal/10" />
            <div className="absolute left-1/2 top-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-signal/15" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-signal/10" />
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-signal/10" />
          </div>
          <div className="relative flex items-center gap-3">
            <Crosshair className="h-9 w-9 text-signal" strokeWidth={1.3} />
            <div>
              <div className="font-display text-3xl font-bold tracking-wide">DKIP</div>
              <div className="eyebrow">Defense Knowledge Intelligence</div>
            </div>
          </div>
          <div className="relative max-w-lg">
            <h1 className="font-display text-4xl font-bold leading-tight text-fg-hi">
              Ask the corpus.<br />Get a <span className="text-signal">cited, grounded</span> answer.
            </h1>
            <p className="mt-4 text-sm leading-6 text-fg-mid">
              Natural-language questions over your own technical documentation — retrieved,
              reranked and answered only from source passages, with every claim traceable to a
              document, section and page. The system abstains when the corpus cannot support an
              answer.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Badge tone="signal">Hybrid retrieval</Badge>
              <Badge tone="signal">Cross-encoder rerank</Badge>
              <Badge tone="ok">Grounded &amp; cited</Badge>
              <Badge tone="caution">Abstains, never guesses</Badge>
            </div>
          </div>
          <div className="relative stamp text-fg-low">POC 1 · v1.0 · Air-gap capable · Model-gateway swap</div>
        </div>

        {/* Sign-in panel */}
        <div className="flex items-center justify-center p-6">
          <Panel className="w-full max-w-md p-8" glow>
            <div className="mb-6 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-signal" />
              <span className="eyebrow">Authorized access</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-fg-hi">Sign in</h2>
            <p className="mt-1 text-sm text-fg-mid">Authenticate to query the knowledge corpus.</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="stamp mb-1 block text-fg-mid">Username</label>
                <input className="field" value={username} autoFocus autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)} placeholder="analyst" />
              </div>
              <div>
                <label className="stamp mb-1 block text-fg-mid">Password</label>
                <input className="field" type="password" value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              {error && (
                <div className="rounded-[3px] border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical">
                  {error}
                </div>
              )}
              <button type="submit" className="btn-primary w-full" disabled={busy || !username || !password}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {busy ? "Verifying" : "Sign in"}
              </button>
            </form>

            {keycloakConfigured && (
              <button onClick={() => loginWithKeycloak().catch((e) => setError(e.message))}
                className="btn-ghost mt-3 w-full">
                Sign in with Keycloak SSO
              </button>
            )}

            <div className="mt-6 border-t border-line pt-4">
              <div className="stamp mb-2 text-fg-low">Demonstration accounts</div>
              <div className="grid gap-1.5">
                {DEMO.map(([u, p, r]) => (
                  <button key={u} onClick={() => { setUsername(u); setPassword(p); }}
                    className="flex items-center justify-between rounded-[3px] border border-line bg-surface-2/50 px-3 py-1.5 text-left hover:border-signal/40">
                    <span className="font-mono text-xs text-fg-hi">{u} / {p}</span>
                    <span className="stamp text-fg-low">{r}</span>
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </div>
      <ClassificationBanner text="UNCLASSIFIED // FOR DEMONSTRATION" edge="bottom" />
    </div>
  );
}
