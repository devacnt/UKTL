import { DataError } from "@/components/app/DataError";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppLayout";

export const Route = createFileRoute("/app")({
  // The candidate area is for signed-in candidates (and staff opening a record).
  // Server functions enforce the same rule; this guard only decides what to render.
  beforeLoad: ({ context, location }) => {
    const { session } = context;
    if (!session.userId) {
      throw redirect({ to: "/auth/login", search: { redirect: location.href } });
    }
    if (session.staffRole && !session.isStaff) throw redirect({ to: "/auth/security" });
    if (session.accountRole === "employer" && !session.isStaff) throw redirect({ href: "/employer" });
  },
  head: () => ({
    meta: [
      { title: "My account — UK Talent Link" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  errorComponent: DataError,
  component: AppLayoutRoute,
});

function AppLayoutRoute() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
