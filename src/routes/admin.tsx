import { DataError } from "@/components/app/DataError";
import type { ReactNode } from "react";
import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { adminLogoutFn, adminSessionFn } from "@/lib/functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    if (location.pathname.startsWith("/admin/login")) return { staffRole: null };
    const access = await adminSessionFn();
    if (access.mfaRequired) throw redirect({ to: "/auth/security" });
    if (!access.valid) throw redirect({ to: "/admin/login" });
    if (access.role === "consultant" && !location.pathname.startsWith("/admin/candidates")) throw redirect({ to: "/admin/candidates" });
    return { staffRole: access.role };
  },
  errorComponent: DataError,
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/faq", label: "FAQ Topics" },
  { to: "/admin/hr", label: "HR content review" },
  { to: "/admin/jobs", label: "Mandates" },
  { to: "/admin/candidates", label: "Candidates" },
  { to: "/admin/bookings", label: "Consultations" },
  { to: "/admin/enquiries", label: "Enquiries" },
  { to: "/admin/campaigns", label: "Email campaigns" },
  { to: "/admin/calendar", label: "Calendar sync" },
  { to: "/admin/analytics", label: "Analytics" },
  { to: "/admin/processing", label: "CV processing" },
  { to: "/admin/operations", label: "Operations & privacy" },
] as const;

function AdminLayout() {
  const router = useRouter();
  const { staffRole } = Route.useRouteContext();
  if (router.state.location.pathname.startsWith("/admin/login")) return <Outlet />;

  async function logout() {
    await adminLogoutFn();
    await router.invalidate();
    await router.navigate({ to: "/admin/login" });
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-52 flex-shrink-0 border-r border-rule bg-paper-deep/40 flex flex-col">
        <div className="px-5 py-5 border-b border-rule">
          <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-mute">
            UK Talent Link
          </div>
          <div className="font-display font-light text-lg mt-0.5 text-ink">Admin</div>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-wrap gap-1 md:block md:space-y-0.5">
          {NAV.filter(item => staffRole === "admin" || item.to === "/admin/candidates").map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={"exact" in item && item.exact ? { exact: true } : undefined}
              className="flex items-center gap-2.5 px-3 py-2 rounded text-sm text-ink-soft hover:text-ink hover:bg-paper-deep transition-colors"
              activeProps={{ className: "flex items-center gap-2.5 px-3 py-2 rounded text-sm text-ink bg-paper border border-rule" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-rule">
          <button
            onClick={logout}
            className="w-full text-left px-3 py-2 rounded text-sm text-ink-mute hover:text-ink hover:bg-paper-deep transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// ── Shared admin UI primitives ────────────────────────────────────────────────

/** Admin-only CSV download link (the server also enforces admin + MFA and audits it). */
export function ExportLink({ kind, job, label = "Export CSV" }: { kind: "candidates" | "pipeline" | "enquiries" | "bookings"; job?: string; label?: string }) {
  const { staffRole } = Route.useRouteContext();
  if (staffRole !== "admin") return null;
  return (
    <a
      href={`/api/admin/export/${kind}${job ? `?job=${encodeURIComponent(job)}` : ""}`}
      className="text-[12px] px-3.5 py-1.5 border border-rule rounded-full text-ink-soft hover:border-ink hover:text-ink transition-colors"
    >
      {label}
    </a>
  );
}

export function AdminHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6">
      <div>
        <h1 className="font-display font-light text-3xl tracking-[-0.02em] text-ink">{title}</h1>
        {sub && <p className="text-sm text-ink-soft mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

export function AdminTable({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="border border-rule rounded-md overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-paper-deep">
            {head.map((h) => (
              <th
                key={h}
                className="text-left font-mono text-[10px] tracking-[0.14em] uppercase text-ink-mute px-4 py-2.5 font-normal"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function AdminTr({ children }: { children: ReactNode }) {
  return <tr className="border-t border-rule hover:bg-paper-deep/30">{children}</tr>;
}

export function AdminTd({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

export function AdminBtn({
  children,
  variant = "default",
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  variant?: "default" | "primary" | "danger";
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const cls =
    variant === "primary"
      ? "border-ink bg-ink text-paper hover:opacity-90"
      : variant === "danger"
        ? "border-red-300 text-red-700 hover:border-red-600 hover:bg-red-50"
        : "border-rule text-ink-soft hover:border-ink hover:text-ink";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`text-[12px] px-3.5 py-1.5 border rounded-full transition-colors disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

export function AdminField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="block">
        <span className="block font-mono text-[11px] tracking-[0.12em] uppercase text-ink-mute mb-1.5">{label}</span>
        {children}
      </label>
      {hint && <p className="text-xs text-ink-mute mt-1">{hint}</p>}
    </div>
  );
}

export const inputCls =
  "w-full border border-rule rounded px-3 py-2 text-sm bg-paper text-ink placeholder:text-ink-mute focus:outline-none focus:border-ink transition-colors";

export const textareaCls =
  "w-full border border-rule rounded px-3 py-2 text-sm bg-paper text-ink placeholder:text-ink-mute resize-y focus:outline-none focus:border-ink transition-colors";

export const selectCls =
  "w-full border border-rule rounded px-3 py-2 text-sm bg-paper text-ink focus:outline-none focus:border-ink transition-colors";
