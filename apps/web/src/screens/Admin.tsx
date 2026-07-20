import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Plus, RefreshCw, Shield, Trash2 } from "lucide-react";
import { useState } from "react";

import { PageHeader, Panel, StatusLed, cx } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Admin() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"users" | "config" | "health">("config");

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get("/health"),
    refetchInterval: 10000,
  });

  const provider = useQuery({
    queryKey: ["provider"],
    queryFn: () => api.get("/config/model-provider"),
  });

  const swapProvider = useMutation({
    mutationFn: (p: string) => api.put("/config/model-provider", { provider: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["provider"] }); qc.invalidateQueries({ queryKey: ["health"] }); },
  });

  const tabs = [
    { id: "config" as const, label: "Model Gateway" },
    { id: "users" as const, label: "Users" },
    { id: "health" as const, label: "System Health" },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Admin Console" sub="Manage configuration, users, and system health" />

      <div className="mb-4 flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              tab === t.id ? "bg-surface-2 font-medium text-fg-hi" : "text-fg-mid hover:text-fg-hi",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "config" && (
        <Panel className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Cpu className="h-5 w-5 text-accent" />
            <h3 className="text-sm font-semibold text-fg-hi">Model Provider</h3>
          </div>
          <div className="mb-3">
            <span className="stamp text-fg-low">Current: </span>
            <span className="text-sm font-medium text-fg-hi">
              {provider.data?.provider ?? "…"} · {provider.data?.gen_model ?? ""}
            </span>
            {provider.data?.needs_reindex && (
              <span className="ml-2 rounded bg-caution/20 px-2 py-0.5 text-[10px] font-semibold text-caution">
                NEEDS RE-INDEX
              </span>
            )}
          </div>
          <div className="mb-3 text-xs text-fg-mid">
            Embed signature: {provider.data?.embed_signature ?? "…"} → Qdrant:{" "}
            {provider.data?.qdrant_collection ?? "…"}
          </div>
          <div className="flex gap-2">
            {(["cloud", "local"] as const).map((p) => (
              <button
                key={p}
                onClick={() => swapProvider.mutate(p)}
                disabled={swapProvider.isPending || provider.data?.provider === p}
                className={cx(
                  "btn-primary flex items-center gap-1.5",
                  provider.data?.provider === p && "opacity-60",
                )}
              >
                {swapProvider.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
                Switch to {p === "cloud" ? "OpenAI (Cloud)" : "Local (vLLM/BGE)"}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-fg-low">
            Embedding provider change triggers a re-index job — existing collections are retained until cutover.
            Generate and rerank swaps are zero-data-change.
          </p>
        </Panel>
      )}

      {tab === "users" && <UserManager />}

      {tab === "health" && (
        <Panel className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent" />
            <h3 className="text-sm font-semibold text-fg-hi">System Health</h3>
          </div>
          {health.data?.checks && Object.entries(health.data.checks as Record<string, any>).map(([name, c]) => (
            <div key={name} className="mb-2 flex items-center gap-2 text-sm">
              <StatusLed tone={c?.reachable !== false ? "ok" : "critical"} />
              <span className="font-mono text-xs text-fg-hi">{name}</span>
              {c?.error && <span className="text-xs text-critical">{c.error}</span>}
              {typeof c === "object" && !c.reachable && c.key_present === false && (
                <span className="text-xs text-caution">API key not configured</span>
              )}
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}

function UserManager() {
  const qc = useQueryClient();
  const users = useQuery<any[]>({ queryKey: ["users"], queryFn: () => api.get("/users") });
  const [form, setForm] = useState({ username: "", password: "", display_name: "", role: "user", clearance: 1 });

  const createUser = useMutation({
    mutationFn: (u: typeof form) => api.post("/users", u),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setForm({ username: "", password: "", display_name: "", role: "user", clearance: 1 }); },
  });

  const disableUser = useMutation({
    mutationFn: (username: string) => api.patch(`/users/${username}`, { disabled: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-fg-hi">Create Local User</h3>
        <div className="grid grid-cols-2 gap-3">
          <input className="field" placeholder="Username" value={form.username}
                 onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="field" type="password" placeholder="Password" value={form.password}
                 onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className="field" placeholder="Display name" value={form.display_name}
                 onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <select className="field" value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <input className="field" type="number" min={1} max={4} placeholder="Clearance (1-4)" value={form.clearance}
                 onChange={(e) => setForm({ ...form, clearance: Number(e.target.value) })} />
          <button className="btn-primary" onClick={() => createUser.mutate(form)}
                  disabled={!form.username || !form.password || createUser.isPending}>
            <Plus className="mr-1 inline h-3.5 w-3.5" /> Create User
          </button>
        </div>
      </Panel>

      <Panel className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-fg-hi">Users</h3>
        {users.data?.length === 0 && <p className="text-sm text-fg-low">No users found.</p>}
        <div className="space-y-1">
          {users.data?.map((u: any) => (
            <div key={u.subject} className="flex items-center justify-between rounded-md bg-surface-1 px-3 py-2">
              <div>
                <span className="text-sm font-medium text-fg-hi">{u.name || u.subject}</span>
                <span className="ml-2 stamp text-fg-low">{u.role} · CL{u.clearance}</span>
                {u.disabled && <span className="ml-2 rounded bg-critical/20 px-1.5 py-0.5 text-[10px] text-critical">DISABLED</span>}
              </div>
              {!u.disabled && (
                <button className="btn-ghost !px-2 !py-1 text-xs text-critical"
                        onClick={() => disableUser.mutate(u.subject)}>
                  <Trash2 className="mr-1 inline h-3 w-3" /> Disable
                </button>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
