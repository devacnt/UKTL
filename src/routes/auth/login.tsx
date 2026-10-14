import { useState } from "react";
import { SocialSignIn } from "@/components/app/SocialSignIn";
import { oauthProvidersFn } from "@/lib/oauth-functions";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { candidateLoginFn, candidateMagicLinkFn } from "@/lib/functions";

import { safeRedirect } from "@/lib/safe-redirect";
import { accountDestination } from "@/lib/account-role";

export const Route = createFileRoute("/auth/login")({
  validateSearch: (s) => z.object({ redirect: z.string().optional() }).parse(s),
  beforeLoad: ({ context, search }) => {
    if (context.session.userId) throw redirect({ href: accountDestination(context.session, safeRedirect(search.redirect)) });
  },
  loader: () => oauthProvidersFn(),
  component: LoginPage,
});

function LoginPage() {
  const providers = Route.useLoaderData();
  const router = useRouter();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkSent,setLinkSent]=useState(false);
  async function magicLink(){setLoading(true);setError(null);try{await candidateMagicLinkFn({data:{email}});setLinkSent(true);}catch(e){setError(e instanceof Error?e.message:"Unable to send sign-in link");}finally{setLoading(false);}}

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await candidateLoginFn({ data: { email, password } });
      toast.success(`Signed in as ${result.email ?? email}`);
      await router.invalidate();
      await router.navigate({ href: accountDestination(result, safeRedirect(search.redirect)) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-8 text-center">
        <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-ink-mute mb-3">
          — Talent Compass
        </div>
        <h1
          className="font-display font-light tracking-[-0.025em]"
          style={{ fontSize: "clamp(28px, 4vw, 36px)", fontVariationSettings: '"opsz" 144, "SOFT" 50' }}
        >
          Sign in
        </h1>
        <p className="text-sm text-ink-soft mt-2">
          Sign in to your candidate, employer or staff account. Staff verify their authenticator next.
        </p>
      </div>

      <div className="mb-5">
        <SocialSignIn providers={providers} redirect={search.redirect} mode="login" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block font-mono text-[11px] tracking-[0.12em] uppercase text-ink-mute mb-1.5">
            Email
          </label>
          <input id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full border border-rule rounded-md px-4 py-3 text-sm bg-paper text-ink placeholder:text-ink-mute focus:outline-none focus:border-ink transition-colors"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block font-mono text-[11px] tracking-[0.12em] uppercase text-ink-mute mb-1.5">
            Password
          </label>
          <input id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full border border-rule rounded-md px-4 py-3 text-sm bg-paper text-ink placeholder:text-ink-mute focus:outline-none focus:border-ink transition-colors"
          />
        </div>

        {error && (
          <div className="border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-ink text-paper text-sm rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <button type="button" disabled={loading || !email} onClick={magicLink} className="w-full min-h-11 mt-3 border border-rule rounded-md p-3 text-sm disabled:opacity-50">Email me a sign-in link</button>
      {linkSent && <p role="status" className="mt-3 text-sm">If this email has an account, check your inbox for a sign-in link.</p>}

      <div className="mt-6 text-center space-y-3">
        <div>
          <Link
            to="/auth/forgot"
            className="text-sm text-ink-mute hover:text-ink transition-colors underline"
          >
            Forgot your password?
          </Link>
        </div>
        <div className="text-sm text-ink-mute">
          No account?{" "}
          <Link to="/auth/register" className="text-ink underline">
            Register now
          </Link>
        </div>
      </div>
    </div>
  );
}
