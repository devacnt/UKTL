import { useState } from "react";
import { oauthStartFn } from "@/lib/oauth-functions";

type Provider = "google" | "apple";

const LABEL: Record<Provider, string> = { google: "Continue with Google", apple: "Continue with Apple" };

function GoogleMark() {
  // Google's multicolour "G" must keep its brand colours.
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg aria-hidden="true" width="16" height="18" viewBox="0 0 814 1000" fill="currentColor">
      <path d="M788 341c-6 4-110 63-110 193 0 151 132 204 136 206-1 3-21 73-70 145-43 63-89 126-159 126s-88-41-169-41c-79 0-107 42-171 42s-109-58-160-130C26 796 0 684 0 578c0-170 111-261 220-261 58 0 107 38 143 38 35 0 90-40 156-40 25 0 115 2 174 87zM554 159c27-32 46-77 46-122 0-6 0-13-1-18-44 2-96 29-127 65-25 28-48 73-48 119 0 7 1 14 2 16 3 1 8 1 12 1 39 0 88-26 116-61z" />
    </svg>
  );
}

/**
 * Google and Apple sign-in. Both buttons always show (owner's decision); one that
 * is not yet switched on in Supabase Auth explains that instead of failing.
 */
export function SocialSignIn({ providers, redirect, mode }: { providers: Provider[]; redirect?: string; mode: "login" | "register" }) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function start(provider: Provider) {
    setNotice(null);
    if (!providers.includes(provider)) {
      setError(null);
      setNotice(
        `${provider === "apple" ? "Apple" : "Google"} sign-in is being switched on. Please use your email below for now.`,
      );
      return;
    }
    setBusy(provider);
    setError(null);
    try {
      const result = await oauthStartFn({ data: { provider, redirect } });
      if (!result?.url) throw new Error("Sign-in could not be started. Please try again.");
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in could not be started. Please try again.");
      setBusy(null);
    }
  }

  // Apple (ink on paper; inverts in dark mode per Apple's guidelines) first, then Google.
  const order: Provider[] = ["apple", "google"];
  return (
    <div className="space-y-3">
      {order.map((p) => (
        <button
          key={p}
          type="button"
          disabled={busy !== null}
          onClick={() => start(p)}
          className={`w-full flex items-center justify-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-opacity disabled:opacity-50 ${
            p === "apple" ? "bg-ink text-paper hover:opacity-90" : "border border-rule bg-paper text-ink hover:border-ink"
          }`}
        >
          {p === "apple" ? <AppleMark /> : <GoogleMark />}
          {busy === p ? "Redirecting…" : LABEL[p]}
        </button>
      ))}
      {notice && (
        <p role="status" className="text-sm text-ink-soft">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <p className="text-[11px] text-ink-mute text-center">
        {mode === "register"
          ? "Creates your UK Talent Link account with the email from that account."
          : "Uses the email on that account. New here? This creates your account."}
      </p>
      <div className="flex items-center gap-3 pt-1" aria-hidden="true">
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-mute">or with email</span>
        <span className="h-px flex-1 bg-rule" />
      </div>
    </div>
  );
}
