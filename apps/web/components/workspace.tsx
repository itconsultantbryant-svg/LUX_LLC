"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  Wallet,
  GitCompareArrows,
  ChartNoAxesCombined,
  Settings,
  LifeBuoy,
  ShieldCheck,
  Globe,
  LogOut,
  Menu,
  X,
  Bell,
  Building2,
  SearchCheck,
} from "lucide-react";
import { Brand } from "./public-shell";
import { authClient } from "../lib/auth-client";
type Membership = {
  id: string;
  name: string;
  type: string;
  roles: string[];
  permissions: string[];
};
type State = {
  me: any;
  org: Membership;
  api: (path: string, init?: RequestInit) => Promise<any>;
  refresh: () => void;
  revision: number;
};
const WorkspaceContext = createContext<State | null>(null);
export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw Error("Workspace provider required");
  return ctx;
};
export function money(
  value: string | number | null | undefined,
  currency = "USD",
) {
  const amount = BigInt(value || 0),
    absolute = amount < 0n ? -amount : amount;
  return `${currency} ${amount < 0n ? "-" : ""}${new Intl.NumberFormat("en-LR").format(absolute / 100n)}.${String(absolute % 100n).padStart(2, "0")}`;
}
export function date(value: string) {
  return new Intl.DateTimeFormat("en-LR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Monrovia",
  }).format(new Date(value));
}
const links = [
  ["Overview", "/app", LayoutDashboard, "all"],
  ["Patients & Eligibility", "/app/eligibility", Users, "eligibility"],
  ["Encounters", "/app/encounters", FileText, "clinical"],
  ["Claims", "/app/claims", FileText, "claims"],
  ["Claims Queue", "/app/claims", FileText, "review"],
  ["Flagged Claims", "/app/flagged", SearchCheck, "review"],
  ["Returned Claims", "/app/returned", FileText, "facility"],
  ["Decisions & Appeals", "/app/decisions", ShieldCheck, "review"],
  ["Coverage & Tariffs", "/app/coverage", ShieldCheck, "coverage"],
  ["Contracted Organizations", "/app/contracts", Building2, "contracts"],
  ["Payment Authorizations", "/app/payments", Wallet, "payments.authorize"],
  ["Payments", "/app/payments", Wallet, "payments.read"],
  ["Reconciliation", "/app/reconciliation", GitCompareArrows, "reconciliation"],
  ["Reports", "/app/reports", ChartNoAxesCombined, "reports"],
  [
    "Organization Requests",
    "/app/organization-requests",
    Building2,
    "organizations",
  ],
  ["Organizations", "/app/organizations", Building2, "organizations"],
  ["Integration Health", "/app/integrations", Globe, "operations"],
  ["Validation Operations", "/app/jobs", SearchCheck, "operations"],
  ["Fee Revenue", "/app/fees", ChartNoAxesCombined, "fees"],
  ["Public Content", "/app/content", Globe, "cms"],
  ["Team", "/app/team", Users, "cms"],
  ["Enquiries", "/app/enquiries", LifeBuoy, "organizations"],
  ["Users", "/app/users", Users, "users"],
  ["Audit", "/app/audit", ShieldCheck, "audit"],
  ["Support", "/app/support", LifeBuoy, "all"],
  ["Settings", "/app/settings", Settings, "all"],
] as const;
export function Workspace({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<any>(null),
    [orgId, setOrgId] = useState(""),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [open, setOpen] = useState(false);
  const path = usePathname();
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/me");
      if (res.status === 401) {
        location.assign("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw Error(data.message);
      setMe(data);
      setOrgId((id) =>
        data.memberships.some((m: Membership) => m.id === id)
          ? id
          : data.memberships[0]?.id || "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load your session.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setOpen(false);
  }, [path]);
  const org = me?.memberships.find((m: Membership) => m.id === orgId);
  const api = useCallback(
    async (p: string, init: RequestInit = {}) => {
      const r = await fetch("/api/v1" + p, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-Organization-ID": orgId,
          ...init.headers,
        },
      });
      const d = await r.json();
      if (!r.ok)
        throw Error(
          `${d.message || "Operation failed"}${d.correlationId ? " · Reference " + d.correlationId : ""}`,
        );
      return d;
    },
    [orgId],
  );
  if (error)
    return (
      <main className="auth-page" id="main">
        <h1>Workspace unavailable.</h1>
        <p role="alert">{error}</p>
        <button
          className="button"
          onClick={() => {
            setError("");
            load();
          }}
        >
          Retry
        </button>
        <p>
          <Link href="/">Return to website</Link>
        </p>
      </main>
    );
  if (!me)
    return (
      <main className="loading" id="main" role="status">
        Loading your authorized workspace…
      </main>
    );
  if (!org)
    return (
      <main id="main" className="auth-page">
        <h1>No active membership.</h1>
        <p>
          Your account does not currently have approved organization access.
        </p>
        <Link className="button" href="/get-started">
          Contact LUX HealthPay
        </Link>
        <button
          onClick={() => authClient.signOut().then(() => location.assign("/"))}
        >
          Sign out
        </button>
      </main>
    );
  const visible = links.filter((l, i, arr) => {
    const p = l[3];
    return (
      (p === "all" ||
        (p === "facility" &&
          org.type === "FACILITY" &&
          org.permissions.includes("claims")) ||
        (p === "claims" &&
          !org.permissions.includes("review") &&
          org.permissions.includes(p)) ||
        (!["facility", "claims"].includes(p) && org.permissions.includes(p))) &&
      !arr
        .slice(0, i)
        .some(
          (x) =>
            x[1] === l[1] && (org.permissions.includes(x[3]) || x[3] === "all"),
        )
    );
  });
  return (
    <WorkspaceContext.Provider
      value={{
        me,
        org,
        api,
        refresh: () => setRevision((n) => n + 1),
        revision,
      }}
    >
      <div className="app-shell">
        <div className="app-banner">
          {me.mode === "demo"
            ? "DEMO ENVIRONMENT · SYNTHETIC RECORDS · SIMULATED PAYMENTS — NO REAL FUNDS MOVE"
            : `INTEGRATION MODE: ${me.mode.toUpperCase()} · LIVE CAPABILITIES REQUIRE OPERATOR APPROVAL`}
        </div>
        <aside
          className={"app-sidebar" + (open ? " open" : "")}
          aria-label="Workspace navigation"
        >
          <Brand />
          <div className="org-control">
            <label>
              Organization context
              <select
                aria-label="Organization context"
                value={orgId}
                onChange={(e) => {
                  setOrgId(e.target.value);
                  setRevision((n) => n + 1);
                }}
              >
                {me.memberships.map((m: Membership) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <nav>
            {visible.map(([label, href, Icon]) => (
              <Link
                className={path === href ? "active" : ""}
                href={href}
                key={href}
                aria-current={path === href ? "page" : undefined}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <Link href="/">← Public website</Link>
            {open && (
              <button
                aria-label="Close workspace navigation"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            )}
          </div>
        </aside>
        <div className="app-main">
          <header className="app-topbar">
            <button
              className="app-menu-button"
              aria-label="Open workspace navigation"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <Menu size={21} />
            </button>
            <div>
              <small>{org.type.replaceAll("_", " ")} WORKSPACE</small>
              <strong>{org.name}</strong>
            </div>
            <div>
              <small>{me.user.name}</small>
              <button
                onClick={async () => {
                  await authClient.signOut();
                  location.assign("/login");
                }}
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </header>
          <main id="main" className="app-content" key={orgId}>
            {children}
          </main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
export function useData(path: string) {
  const { api, revision } = useWorkspace();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(path));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [api, path]);
  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 20000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [load, revision]);
  return { data, error, loading, reload: load };
}
export function DataBoundary({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  children: ReactNode;
}) {
  if (error)
    return (
      <div className="error-notice" role="alert">
        {error}
        <br />
        <button className="inline-button" onClick={retry}>
          Retry loading
        </button>
      </div>
    );
  if (loading && !children) return <p role="status">Loading records…</p>;
  return <>{children}</>;
}
export function Status({ value }: { value: string }) {
  return (
    <span className="badge">{value.replaceAll("_", " ").toLowerCase()}</span>
  );
}
export function Empty({
  title = "No records yet.",
  text = "Records will appear here when your authorized organization has activity.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function useAction() {
  const { api, refresh } = useWorkspace();
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(
    path: string,
    body?: unknown,
    version?: number,
    method = "POST",
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api(path, {
        method,
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          ...(version !== undefined ? { "If-Match": String(version) } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      refresh();
      setMessage(result.message || "Change recorded.");
      return result;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this operation.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { run, error, message, busy, setMessage };
}
export function Feedback({ action }: { action: ReturnType<typeof useAction> }) {
  return (
    <>
      {action.error && (
        <p className="error-notice" role="alert">
          {action.error}
        </p>
      )}
      {action.message && (
        <p className="app-success" role="status">
          {action.message}
        </p>
      )}
    </>
  );
}
