import { FileText, Lock, Shield, ShieldCheck, Target, User } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Suspense, lazy, useState } from "react";

import { ThemeToggle } from "../components/ThemeToggle";
import { Button, InputField, PasswordField, cx } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

const SignatureScene = lazy(() => import("../components/SignatureScene"));

/** Three weights of one blue, so the roles read as a set rather than as three
 *  unrelated signals. Deliberately not the semantic colours — see tailwind.config. */
const DEMO = [
  { user: "admin", pass: "admin123", role: "Administrator", tint: "text-accent" },
  { user: "analyst", pass: "analyst123", role: "Analyst", tint: "text-accent-soft" },
  { user: "operator", pass: "operator123", role: "Operator", tint: "text-accent-pale" },
] as const;

const PROOF = [
  { icon: FileText, label: "Every answer", value: "Cited to section and page" },
  { icon: ShieldCheck, label: "Unsupported", value: "Marked, never guessed" },
] as const;

export function Login() {
  const { login, loginWithKeycloak, keycloakConfigured } = useAuth();
  const theme = useTheme();
  const still = useReducedMotion();
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
      setError((err as Error).message || "That username and password didn't match. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const enter = (delay: number) =>
    still
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3 } }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <div className="relative h-full overflow-hidden bg-bg">
      <div className="relative flex h-full flex-col overflow-y-auto px-8 py-6 lg:py-6 lg:pl-12 lg:pr-0">
        <motion.header {...enter(0)} className="flex shrink-0 items-center gap-3.5">
          <div className="grid h-12 w-12 place-items-center rounded-xl border border-accent/25 bg-accent-surface shadow-glow">
            <Shield className="h-6 w-6 text-accent" strokeWidth={1.75} aria-hidden />
          </div>
          <div>
            <div className="text-h1 leading-none text-fg-hi">DKIP</div>
            <div className="mt-1.5 text-micro uppercase tracking-[0.18em] text-fg-dim">
              Defense Knowledge Intelligence Platform
            </div>
          </div>
          <ThemeToggle className="ml-auto mr-2" />
        </motion.header>

        <div className="grid flex-1 items-center gap-12 py-5 lg:grid-cols-[minmax(0,36rem)_23rem_minmax(8rem,1fr)] lg:gap-8">
          <motion.div {...enter(0.08)} className="hidden flex-col lg:flex">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/25 bg-accent-surface px-3.5 py-1.5 text-micro uppercase text-accent">
              <Target className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Mission focused. Answer ready.
            </span>

            <h1 className="mt-6 text-hero text-fg-hi">
              Answers you can <span className="text-accent">trace back</span> to the page they came
              from.
            </h1>

            <p className="mt-6 max-w-md text-prose leading-7 text-fg-low">
              Every claim carries the passage it was drawn from. When the documents can't support an
              answer, DKIP says so instead of inventing one — in defense work, a confident wrong
              answer costs more than no answer at all.
            </p>

            <dl className="mt-8 flex max-w-lg gap-10 border-t border-line pt-6">
              {PROOF.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex gap-3.5">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-surface-2">
                    <Icon className="h-5 w-5 text-accent" strokeWidth={1.6} aria-hidden />
                  </div>
                  <div>
                    <dt className="text-micro uppercase text-fg-dim">{label}</dt>
                    <dd className="mt-1 max-w-[9rem] text-body text-fg-mid">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div {...enter(0.16)} className="mx-auto w-full max-w-md">
            <div className="rounded-2xl border border-line-strong bg-surface-1 p-6 shadow-e3">
              <div className="grid h-12 w-12 place-items-center rounded-full border border-accent/30 bg-accent-surface shadow-glow">
                <ShieldCheck className="h-6 w-6 text-accent" strokeWidth={1.6} aria-hidden />
              </div>

              <h2 className="mt-5 text-h1 text-fg-hi">Sign in</h2>
              <p className="mt-1.5 text-body text-fg-low">Authorized access only.</p>

              <form onSubmit={submit} className="mt-6 space-y-3.5">
                <div>
                  <label htmlFor="username" className="mb-2 block text-label text-fg-mid">
                    Username
                  </label>
                  <InputField
                    id="username"
                    icon={User}
                    value={username}
                    autoFocus
                    autoComplete="username"
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="password" className="mb-2 block text-label text-fg-mid">
                    Password
                  </label>
                  <PasswordField
                    id="password"
                    icon={Lock}
                    value={password}
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-md border border-critical/30 bg-critical/10 px-3 py-2 text-label text-critical"
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="hero"
                  className="w-full"
                  loading={busy}
                  disabled={!username || !password}
                >
                  {!busy && <Lock className="h-4 w-4" strokeWidth={2} aria-hidden />}
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </form>

              {keycloakConfigured && (
                <Button
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => loginWithKeycloak().catch((e) => setError(e.message))}
                >
                  Continue with SSO
                </Button>
              )}

              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-micro uppercase text-fg-dim">Demo accounts</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <div className="mt-3.5 space-y-2">
                {DEMO.map(({ user, pass, role, tint }) => (
                  <button
                    key={user}
                    onClick={() => {
                      setUsername(user);
                      setPassword(pass);
                    }}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2",
                      "text-left transition-colors duration-fast hover:border-line-strong hover:bg-surface-3",
                    )}
                  >
                    <User className={cx("h-4 w-4 shrink-0", tint)} strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-label text-fg-mid">
                      {user} <span className="text-fg-dim">/</span> {pass}
                    </span>
                    <span className={cx("shrink-0 text-label", tint)}>{role}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Negative margin lets the structure run off the right edge; the
              column's left edge is the card's right edge, so the panes have a
              hard boundary they cannot cross. */}
          {/* Dark only — the wireframe is additive-blended and has nothing to
              add on a light canvas. In light the column simply yields its space
              to the copy and card. */}
          <div className="pointer-events-none relative hidden h-full min-h-[26rem] lg:block">
            {theme === "dark" && (
              <Suspense fallback={null}>
                <SignatureScene className="h-full w-full" />
              </Suspense>
            )}
          </div>
        </div>

        <motion.footer {...enter(0.24)} className="flex shrink-0 items-center gap-4">
          <span className="h-px flex-1 bg-line" />
          <span className="inline-flex items-center gap-2 text-label text-fg-dim">
            <Shield className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Secure. Traceable. Reliable.
          </span>
          <span className="h-px flex-1 bg-line" />
        </motion.footer>
      </div>
    </div>
  );
}
