import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { KeyRound, Plus, RotateCcw, ShieldCheck, Trash2, UserX, Users } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { PageContainer } from "../components/PageContainer";
import { PageTransition } from "../components/PageTransition";
import { Select } from "../components/Select";
import { StatBand, StatCard } from "../components/StatCard";
import { Badge, Button, InputField, Monogram, PageHeader, Skeleton, cx } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Person {
  subject: string;
  name: string;
  role: "admin" | "user";
  clearance: number;
  disabled: boolean;
}

/**
 * Two choices, but accounts made under the old four-level scheme can still hold
 * a 2 or a 3. Confidential documents sit at 3, so that is where the line falls.
 */
const fullAccess = (clearance: number) => clearance >= 3;
const accessValue = (clearance: number) => (fullAccess(clearance) ? "4" : "1");

const ROLE_OPTIONS = [
  { value: "user", label: "Analyst", description: "Ask questions and build reports" },
  { value: "admin", label: "Administrator", description: "Also manages documents and people" },
];

const ACCESS_OPTIONS = [
  { value: "1", label: "Standard", description: "Documents marked for everyone" },
  { value: "4", label: "Full", description: "Also confidential documents" },
];

/* ──────────────────────────────────────────────────────────────── console ── */

/** Person · Role · Access · Status · action. Declared once so the header band
 *  and every row agree. The screen is now full-width with a stat band on top, so
 *  a Status column earns the width and the person column carries the slack. */
const GRID = "grid grid-cols-[minmax(0,1fr)_10rem_10rem_8rem_2.5rem] items-center gap-4";

/** Accounts, and what each of them may do and read. Its own screen: managing
 *  people is a different job from watching the platform, and mixing the two put
 *  a table nobody could act on underneath four charts. */
export function PeopleScreen() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const people = useQuery<Person[]>({ queryKey: ["users"], queryFn: () => api.get("/users") });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Person | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });
  const patch = useMutation({
    mutationFn: ({ subject, ...body }: { subject: string } & Record<string, unknown>) =>
      api.patch(`/users/${subject}`, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (subject: string) => api.del(`/users/${subject}`),
    onSuccess: () => {
      invalidate();
      setRemoving(null);
    },
  });

  const rows = people.data ?? [];
  const admins = rows.filter((p) => p.role === "admin").length;
  const fullAccessCount = rows.filter((p) => fullAccess(p.clearance)).length;
  const disabledCount = rows.filter((p) => p.disabled).length;

  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          icon={Users}
          eyebrow="Access control"
          title="People"
          sub={
            rows.length
              ? `${rows.length} ${rows.length === 1 ? "account" : "accounts"}, and what each of them can reach.`
              : "Who has an account, and what they can reach."
          }
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add person
            </Button>
          }
        />

        {rows.length > 0 && (
          <StatBand>
            <StatCard icon={Users} label="Accounts" value={rows.length} />
            <StatCard icon={ShieldCheck} label="Administrators" value={admins} />
            <StatCard icon={KeyRound} label="Full access" value={fullAccessCount} />
            <StatCard icon={UserX} label="Disabled" value={disabledCount} />
          </StatBand>
        )}

        <div className="space-y-4">
      {people.isLoading ? (
        <div className="surface-card divide-y divide-line">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={cx(GRID, "px-4 py-2.5")}>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-3.5 w-40" />
              </div>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-14" />
              <span />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            icon={Users}
            title="Nobody else yet"
            body="Add an account for anyone who needs to ask questions or manage the library."
            action={
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Add person
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="surface-card divide-y divide-line">
            <div className={cx(GRID, "tbl-head")}>
              <span>Person</span>
              <span>Role</span>
              <span>Access</span>
              <span>Status</span>
              <span />
            </div>
            {rows.map((p, i) => (
              <PersonRow
                key={p.subject}
                person={p}
                index={i}
                reduce={!!reduce}
                isSelf={p.subject === me?.subject}
                onRole={(role) => patch.mutate({ subject: p.subject, role })}
                onAccess={(clearance) => patch.mutate({ subject: p.subject, clearance: Number(clearance) })}
                onRestore={() => patch.mutate({ subject: p.subject, disabled: false })}
                onRemove={() => setRemoving(p)}
              />
            ))}
          </div>
        </>
      )}

      <p className="text-label leading-relaxed text-fg-dim">
        Role and access are separate. The role decides what someone can change; access decides what they can read.
        Changes take effect the next time they sign in.
      </p>

      <AddPerson open={adding} onClose={() => setAdding(false)} onAdded={invalidate} />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.subject)}
        loading={remove.isPending}
        tone="critical"
        title={`Remove ${removing?.name || removing?.subject}?`}
        confirmLabel="Remove account"
        body={
          <>
            Their account and every conversation they have had are deleted. Documents they uploaded stay in the library,
            and the audit trail keeps their past activity. This cannot be undone.
          </>
        }
      />
        </div>
      </PageContainer>
    </PageTransition>
  );
}

function PersonRow({
  person,
  index,
  reduce,
  isSelf,
  onRole,
  onAccess,
  onRestore,
  onRemove,
}: {
  person: Person;
  index: number;
  reduce: boolean;
  isSelf: boolean;
  onRole: (role: string) => void;
  onAccess: (clearance: string) => void;
  onRestore: () => void;
  onRemove: () => void;
}) {
  // Your own row is read-only: an administrator who demotes themselves loses the
  // console they would need to undo it. Said with a lock and a reason rather
  // than by dimming — a 40%-opacity label drops under the contrast floor.
  const locked = isSelf ? "You can't change your own role or access" : undefined;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.03, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cx(GRID, "tbl-row group", person.disabled && "opacity-60")}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Monogram name={person.name || person.subject} tone={person.role === "admin" ? "accent" : "soft"} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-body text-fg-hi">{person.name || person.subject}</span>
            {isSelf && (
              <span className="shrink-0 rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 text-micro text-fg-dim">
                You
              </span>
            )}
          </div>
          <div className="truncate font-mono text-label text-fg-dim">@{person.subject}</div>
        </div>
      </div>

      <Select
        value={person.role}
        onChange={onRole}
        options={ROLE_OPTIONS}
        variant="inline"
        lockedReason={locked}
        aria-label={`Role for ${person.name || person.subject}`}
      />

      <Select
        value={accessValue(person.clearance)}
        onChange={onAccess}
        options={ACCESS_OPTIONS}
        variant="inline"
        lockedReason={locked}
        aria-label={`Access for ${person.name || person.subject}`}
      />

      <span>
        {person.disabled ? <Badge tone="critical">Disabled</Badge> : <Badge tone="ok">Active</Badge>}
      </span>

      <div className="flex justify-end">
        {isSelf ? null : person.disabled ? (
          <button
            onClick={onRestore}
            title="Restore access"
            aria-label={`Restore access for ${person.name || person.subject}`}
            className="rounded-md p-1.5 text-fg-dim opacity-0 transition-[color,opacity] duration-fast hover:bg-surface-2 hover:text-fg-hi focus-visible:opacity-100 group-hover:opacity-100"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : (
          <button
            onClick={onRemove}
            title="Remove account"
            aria-label={`Remove ${person.name || person.subject}`}
            className="rounded-md p-1.5 text-fg-dim opacity-0 transition-[color,opacity] duration-fast hover:bg-surface-2 hover:text-critical focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function AddPerson({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const blank = { username: "", password: "", display_name: "", role: "user", clearance: "1" };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => api.post("/users", { ...form, clearance: Number(form.clearance) }),
    onSuccess: () => {
      onAdded();
      setForm(blank);
      setError("");
      onClose();
    },
    onError: (e: Error) => setError(e.message || "Could not add this person."),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="Add person"
      panelClassName="w-full max-w-lg rounded-xl border border-line-strong bg-surface-1 p-5 shadow-e3"
    >
      <h2 className="text-h2 text-fg-hi">Add person</h2>
      <p className="mt-1 text-body text-fg-low">They sign in with the username and password you set here.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <InputField
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder="Sgt. V. Kumar"
          />
        </Field>
        <Field label="Username">
          <InputField
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="kumar.v"
          />
        </Field>
        <Field label="Temporary password" className="sm:col-span-2">
          <InputField
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Field label="Role">
          <Select
            value={form.role}
            onChange={(role) => setForm({ ...form, role })}
            options={ROLE_OPTIONS}
            aria-label="Role"
          />
        </Field>
        <Field label="Access">
          <Select
            value={form.clearance}
            onChange={(clearance) => setForm({ ...form, clearance })}
            options={ACCESS_OPTIONS}
            aria-label="Access"
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-body text-critical">
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => create.mutate()}
          loading={create.isPending}
          disabled={!form.username.trim() || !form.password}
        >
          Add person
        </Button>
      </div>
    </Modal>
  );
}

function Field({
  label,
  help,
  className,
  children,
}: {
  label: string;
  help?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-label text-fg-mid">{label}</label>
      {children}
      {help && <p className="mt-1.5 text-label leading-relaxed text-fg-dim">{help}</p>}
    </div>
  );
}

