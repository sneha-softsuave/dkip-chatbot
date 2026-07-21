import { KeyRound, Loader2, Shield, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

import { AmbientScene } from "../components/AmbientScene";
import { GlassPanel } from "../components/GlassPanel";
import { Badge, HoloButton, InputField, cx } from "../components/ui";
import { useAuth } from "../lib/auth";

const DEMO = [
  ["admin", "admin123", "Administrator"],
  ["analyst", "analyst123", "Analyst"],
  ["operator", "operator123", "Operator"],
] as const;

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
      setError((err as Error).message || "Sign in to DKIP failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg">
      <AmbientScene />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="flex min-h-0 flex-1 items-center justify-center p-6"
      >
        <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2">
          {/* Product panel */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="hidden flex-col gap-6 lg:flex"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-bg shadow-glow">
                <Shield className="h-7 w-7" strokeWidth={1.6} />
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight text-fg-hi">DKIP</div>
                <div className="text-xs uppercase tracking-[0.2em] text-fg-low">Defense Knowledge Intelligence Platform</div>
              </div>
            </div>

            <h1 className="max-w-lg text-4xl font-bold leading-tight tracking-tight text-fg-hi">
              Answers sourced from your documents,{" "}
              <span className="text-accent">not from memory</span>.
            </h1>
            <p className="max-w-md text-base leading-relaxed text-fg-mid">
              Every answer is traced to a specific passage in your document corpus. When documentation cannot support a
              confident answer, the system abstains rather than fabricating one — because in defense operations, a wrong
              answer is costlier than none.
            </p>

            <div className="flex flex-wrap gap-2">
              <Badge tone="signal">Hybrid vector + keyword search</Badge>
              <Badge tone="ok">Grounded, cited answers</Badge>
              <Badge tone="neutral">Immutable audit trail</Badge>
              <Badge tone="neutral">RBAC + classification</Badge>
            </div>
          </motion.div>

          {/* Sign-in card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <GlassPanel tilt className="w-full max-w-md p-8" hover={false}>
              <div className="mb-6 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-accent" />
                <span className="eyebrow text-accent">Authorized access only</span>
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-fg-hi">Sign in</h2>
              <p className="mt-1 text-sm text-fg-low">Enter your credentials to access the platform.</p>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-mid">Username</label>
                  <InputField
                    value={username}
                    autoFocus
                    autoComplete="username"
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-fg-mid">Password</label>
                  <InputField
                    type="password"
                    value={password}
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical"
                  >
                    {error}
                  </motion.div>
                )}

                <HoloButton type="submit" variant="primary" className="w-full" disabled={busy || !username || !password}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {busy ? "Signing in…" : "Sign in"}
                </HoloButton>
              </form>

              {keycloakConfigured && (
                <HoloButton
                  onClick={() => loginWithKeycloak().catch((e) => setError(e.message))}
                  variant="ghost"
                  className="mt-3 w-full"
                >
                  Sign in with SSO
                </HoloButton>
              )}

              <div className="mt-6 border-t border-line pt-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-fg-dim">Demo accounts</div>
                <div className="grid gap-2">
                  {DEMO.map(([u, p, r]) => (
                    <motion.button
                      key={u}
                      whileHover={{ scale: 1.01, backgroundColor: "rgba(252, 213, 53, 0.08)" }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => { setUsername(u); setPassword(p); }}
                      className={cx(
                        "flex items-center justify-between rounded-md border border-line bg-surface-1 px-3 py-2 text-left",
                        "transition-colors hover:border-accent/40",
                      )}
                    >
                      <span className="font-mono text-xs text-fg-hi">
                        {u} / {p}
                      </span>
                      <span className="text-xs text-fg-low">{r}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </GlassPanel>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
