import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { getSessionFn } from "@/lib/functions";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export type Session = { userId: string | null; email: string | null; isStaff: boolean; isAdmin: boolean; staffRole?: "admin" | "consultant" | null; accountRole?: "candidate" | "employer" };

const SIGNED_OUT: Session = { userId: null, email: null, isStaff: false, isAdmin: false };

export const Route = createRootRoute({
  // Re-evaluated on every navigation, so sign-in/out is reflected everywhere at once.
  beforeLoad: async (): Promise<{ session: Session }> => {
    try {
      return { session: await getSessionFn() };
    } catch {
      return { session: SIGNED_OUT };
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "UK Talent Link" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@uktalentlink" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,200..900,30..100;1,9..144,200..900,30..100&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  // Marks the document once React has taken over; e2e tests wait for it before interacting.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <>
      <Outlet />
      <Toaster
        position="bottom-right"
        offset={20}
        toastOptions={{
          style: {
            background: "var(--paper)",
            color: "var(--ink)",
            border: "1px solid var(--rule)",
            borderRadius: "8px",
            fontFamily: "var(--font-body)",
            fontSize: "13px",
            boxShadow: "0 8px 24px oklch(0.095 0.003 60 / 0.08)",
          },
        }}
      />
    </>
  );
}
