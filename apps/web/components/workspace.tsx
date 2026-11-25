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
  ClipboardCheck,
  ShieldAlert,
  Gavel,
  BadgeDollarSign,
  Activity,
  Send,
  MapPin,
  Inbox,
  UserRoundCog,
  Newspaper,
  ChevronRight,
  CheckCheck,
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
type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission?: string | string[];
  orgTypes?: string[];
  badge?: string;
};
type NavGroup = { title: string; items: NavItem[] };
type State = {
  me: any;
  org: Membership;
  api: (path: string, init?: RequestInit) => Promise<any>;
  refresh: () => void;
  revision: number;
  demo: boolean;
};
const WorkspaceContext = createContext<State | null>(null);
export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw Error("Workspace provider required");
  return ctx;
};
export function money(
  value: string | number | bigint | null | undefined,
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
const NAV_GROUPS: NavGroup[] = [
  {
    title: "Workspace",
    items: [
      {
        label: "Overview",
        href: "/app",
        icon: LayoutDashboard,
        permission: "all",
      },
    ],
  },
  {
    title: "Care delivery",
    items: [
      {
        label: "Patients & eligibility",
        href: "/app/eligibility",
        icon: Users,
        permission: "eligibility",
      },
      {
        label: "Encounters",
        href: "/app/encounters",
        icon: ClipboardCheck,
        permission: "clinical",
        orgTypes: ["FACILITY"],
      },
      {
        label: "Claims",
        href: "/app/claims",
        icon: FileText,
        permission: "claims",
        orgTypes: ["FACILITY"],
        badge: "claims",
      },
      {
        label: "Returned claims",
        href: "/app/returned",
        icon: Inbox,
        permission: "claims",
        orgTypes: ["FACILITY"],
        badge: "returned",
      },
    ],
  },
  {
    title: "Claims operations",
    items: [
      {
        label: "Claims queue",
        href: "/app/claims",
        icon: FileText,
        permission: "review",
        orgTypes: ["INSURER"],
        badge: "review",
      },
      {
        label: "Flagged claims",
        href: "/app/flagged",
        icon: ShieldAlert,
        permission: "review",
        badge: "flagged",
      },
      {
        label: "Decisions & appeals",
        href: "/app/decisions",
        icon: Gavel,
        permission: "review",
        badge: "decisions",
      },
    ],
  },
  {
    title: "Coverage & contracts",
    items: [
      {
        label: "Coverage & tariffs",
        href: "/app/coverage",
        icon: ShieldCheck,
        permission: "coverage",
      },
      {
        label: "Contracted organizations",
        href: "/app/contracts",
        icon: Building2,
        permission: "contracts",
      },
      {
        label: "Patient portal access",
        href: "/app/patient-access",
        icon: Users,
        permission: "coverage",
        orgTypes: ["INSURER"],
      },
      {
        label: "Wallet destination",
        href: "/app/destination",
        icon: MapPin,
        permission: "destination",
      },
    ],
  },
  {
    title: "Finance & settlement",
    items: [
      {
        label: "Payroll & salary cover",
        href: "/app/payroll",
        icon: BadgeDollarSign,
        permission: "payroll",
      },
      {
        label: "Wallet & float",
        href: "/app/wallet",
        icon: Wallet,
        permission: "wallet.read",
      },
      {
        label: "Payments & authorizations",
        href: "/app/payments",
        icon: Wallet,
        permission: "payments.read",
        badge: "payments",
      },
      {
        label: "Reconciliation",
        href: "/app/reconciliation",
        icon: GitCompareArrows,
        permission: "reconciliation",
        badge: "exceptions",
      },
      {
        label: "Reports & statements",
        href: "/app/reports",
        icon: ChartNoAxesCombined,
        permission: "reports",
      },
      {
        label: "Fee revenue",
        href: "/app/fees",
        icon: BadgeDollarSign,
        permission: "fees",
      },
    ],
  },
  {
    title: "Network",
    items: [
      {
        label: "Organizations",
        href: "/app/organizations",
        icon: Building2,
        permission: "organizations",
      },
      {
        label: "Organization requests",
        href: "/app/organization-requests",
        icon: Send,
        permission: "organizations",
        badge: "organization-requests",
      },
      {
        label: "Public enquiries",
        href: "/app/enquiries",
        icon: LifeBuoy,
        permission: "organizations",
        badge: "enquiries",
      },
    ],
  },
  {
    title: "Platform operations",
    items: [
      {
        label: "Integration health",
        href: "/app/integrations",
        icon: Activity,
        permission: "operations",
      },
      {
        label: "Validation operations",
        href: "/app/jobs",
        icon: SearchCheck,
        permission: "operations",
        badge: "jobs",
      },
    ],
  },
  {
    title: "Content & team",
    items: [
      {
        label: "Public content",
        href: "/app/content",
        icon: Newspaper,
        permission: "cms",
      },
      {
        label: "Team profiles",
        href: "/app/team",
        icon: Users,
        permission: "cms",
      },
    ],
  },
  {
    title: "Governance",
    items: [
      {
        label: "Organization users",
        href: "/app/users",
        icon: UserRoundCog,
        permission: "users",
      },
      {
        label: "Audit history",
        href: "/app/audit",
        icon: ShieldCheck,
        permission: "audit",
      },
      {
        label: "Support",
        href: "/app/support",
        icon: LifeBuoy,
        permission: "all",
        badge: "support",
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        label: "Settings",
        href: "/app/settings",
        icon: Settings,
        permission: "all",
      },
    ],
  },
];
// Patient accounts never see an organization navigation tree. These are the
// only destinations their scoped endpoints can serve.
const PATIENT_NAV_GROUPS: NavGroup[] = [
  {
    title: "My health cover",
    items: [
      {
        label: "Overview",
        href: "/app",
        icon: LayoutDashboard,
        permission: "all",
      },
      {
        label: "Coverage & balance",
        href: "/app/my-coverage",
        icon: ShieldCheck,
        permission: "patient",
      },
      {
        label: "Claims history",
        href: "/app/my-claims",
        icon: FileText,
        permission: "patient",
      },
    ],
  },
];
function itemVisible(item: NavItem, org: Membership) {
  if (item.orgTypes && !item.orgTypes.includes(org.type)) return false;
  if (!item.permission) return true;
  const required = Array.isArray(item.permission)
    ? item.permission
    : [item.permission];
  return required.some((p) => p === "all" || org.permissions.includes(p));
}
function isActive(path: string, href: string) {
  return href === "/app"
    ? path === "/app"
    : path === href || path.startsWith(href + "/");
}
export function Workspace({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<any>(null),
    [orgId, setOrgId] = useState(""),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [open, setOpen] = useState(false),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [nav, setNav] = useState<any>({ unread: 0, items: [], badges: {} });
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
    setNotificationsOpen(false);
  }, [path]);
  const org = me?.memberships.find((m: Membership) => m.id === orgId) as
    Membership | undefined;
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
  const loadNav = useCallback(async () => {
    if (!orgId) return;
    try {
      const r = await fetch("/api/v1/nav", {
        cache: "no-store",
        headers: { "X-Organization-ID": orgId },
      });
      if (r.ok) setNav(await r.json());
    } catch {
      // A transient badge failure must not interrupt the workspace.
    }
  }, [orgId]);
  useEffect(() => {
    loadNav();
    const onFocus = () => loadNav();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadNav();
    }, 20000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [loadNav, revision]);
  async function markAllRead() {
    try {
      await api("/notifications/read", { method: "POST" });
      setNotificationsOpen(false);
      await loadNav();
      setRevision((n) => n + 1);
    } catch {
      // Leave the badge visible when the read receipt cannot be recorded.
    }
  }
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
  const groups = (org.type === "PATIENT" ? PATIENT_NAV_GROUPS : NAV_GROUPS)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => itemVisible(item, org)),
    }))
    .filter((group) => group.items.length);
  const initials = String(me.user.name || "LUX")
    .split(" ")
    .map((part: string) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <WorkspaceContext.Provider
      value={{
        me,
        org,
        api,
        refresh: () => setRevision((n) => n + 1),
        revision,
        demo: me.mode === "demo",
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
          aria-label="Workspace sidebar"
        >
          <div className="sidebar-head">
            <Brand />
            <button
              className="sidebar-close"
              aria-label="Close workspace navigation"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="org-control">
            <label>
              {org.type === "PATIENT"
                ? "Patient portal"
                : org.type.replaceAll("_", " ") + " context"}
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
            <div
              className="org-roles"
              aria-label="Your roles in this organization"
            >
              {org.roles.map((role) => (
                <span key={role}>
                  {role.replaceAll("_", " ").toLowerCase()}
                </span>
              ))}
            </div>
          </div>
          <nav aria-label="Workspace navigation">
            {groups.map((group) => (
              <div className="nav-group" key={group.title}>
                <p className="nav-group-title">{group.title}</p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(path, item.href);
                  const count = item.badge
                    ? Number(nav.badges?.[item.badge] || 0)
                    : 0;
                  return (
                    <Link
                      className={active ? "active" : ""}
                      href={item.href}
                      key={item.href + item.label}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                      {count > 0 && (
                        <span
                          className="nav-badge"
                          aria-label={`${count} open`}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                      {active && (
                        <ChevronRight
                          className="nav-active-arrow"
                          size={13}
                          aria-hidden="true"
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <Link href="/">← Public website</Link>
            <span>Teams in Africa/Monrovia</span>
          </div>
        </aside>
        {open && (
          <button
            className="sidebar-scrim"
            aria-label="Close workspace navigation"
            onClick={() => setOpen(false)}
          />
        )}
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
            <div className="topbar-context">
              <small>{org.type.replaceAll("_", " ")} WORKSPACE</small>
              <strong>{org.name}</strong>
            </div>
            <div className="topbar-actions">
              {org.type !== "PATIENT" && (
                <div className="notif-wrap">
                  <button
                    className="notif-button"
                    aria-label={
                      nav.unread
                        ? `Notifications, ${nav.unread} unread`
                        : "Notifications"
                    }
                    aria-expanded={notificationsOpen}
                    onClick={() => setNotificationsOpen(!notificationsOpen)}
                  >
                    <Bell size={18} />
                    {nav.unread > 0 && (
                      <span className="notif-dot" aria-hidden="true">
                        {nav.unread > 9 ? "9+" : nav.unread}
                      </span>
                    )}
                  </button>
                  {notificationsOpen && (
                    <div
                      className="notif-panel"
                      role="dialog"
                      aria-label="Notifications"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setNotificationsOpen(false);
                      }}
                    >
                      <div className="notif-head">
                        <strong>Notifications</strong>
                        <button className="inline-button" onClick={markAllRead}>
                          <CheckCheck size={13} /> Mark all read
                        </button>
                      </div>
                      {nav.items?.length ? (
                        nav.items.map((n: any) => (
                          <Link
                            className={
                              "notif-item" + (n.read_at ? "" : " unread")
                            }
                            href={n.link}
                            key={n.id}
                            onClick={() => setNotificationsOpen(false)}
                          >
                            <span>{n.title}</span>
                            <small>{date(n.created_at)}</small>
                          </Link>
                        ))
                      ) : (
                        <p className="notif-empty">No notifications yet.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="topbar-user">
                <span className="avatar" aria-hidden="true">
                  {initials}
                </span>
                <div>
                  <strong>{me.user.name}</strong>
                  <small>
                    {org.roles.length} active role
                    {org.roles.length === 1 ? "" : "s"}
                  </small>
                </div>
              </div>
              <button
                className="signout-button"
                onClick={async () => {
                  await authClient.signOut();
                  location.assign("/login");
                }}
              >
                <LogOut size={15} /> <span>Sign out</span>
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
export function useData(path: string, intervalMs = 20000) {
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
    }, intervalMs);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [load, revision, intervalMs]);
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
