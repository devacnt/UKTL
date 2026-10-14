import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { candidateSetPasswordFn, getCandidateSessionFn } from "@/lib/functions";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/password-policy";
export const Route = createFileRoute("/auth/reset")({ loader: () => getCandidateSessionFn(), component: ResetPage });
function ResetPage() {
  const session = Route.useLoaderData();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <div><h1 className="font-display text-3xl">Password updated</h1><p className="my-4">Sign in with your new password.</p><Link to="/auth/login" className="underline">Sign in</Link></div>;
  if (!session.userId) return <div><h1 className="font-display text-3xl">Request a recovery link</h1><p className="my-4">Open the link in your recovery email to set a new password.</p><Link to="/auth/forgot" className="underline">Request a new link</Link></div>;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (password !== confirmation) { setError("Passwords do not match"); return; }
    setBusy(true);
    try { await candidateSetPasswordFn({ data: { password } }); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to change password"); }
    finally { setBusy(false); }
  }
  return <div className="w-full max-w-[400px]"><h1 className="font-display text-3xl mb-6">Set a new password</h1>
    <form onSubmit={submit} className="space-y-4">
      <label className="block">New password<input className="block w-full border border-rule rounded p-3 mt-2" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH} required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <p className="text-sm text-ink-soft">Use at least {MIN_PASSWORD_LENGTH} characters.</p>
      <label className="block">Confirm password<input className="block w-full border border-rule rounded p-3 mt-2" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={busy} className="bg-ink text-paper rounded p-3 w-full">{busy ? "Updating…" : "Update password"}</button>
    </form></div>;
}
