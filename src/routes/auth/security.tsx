import { useState } from "react";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { adminSessionFn, staffMfaEnrollFn, staffMfaStatusFn, staffMfaVerifyFn, adminLogoutFn } from "@/lib/functions";
export const Route = createFileRoute("/auth/security")({
  beforeLoad: async () => { const access = await adminSessionFn(); if (!access.role) throw redirect({ to: "/admin/login" }); },
  loader: () => staffMfaStatusFn(), component: SecurityPage,
});
function SecurityPage() {
  const status = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof staffMfaEnrollFn>> | null>(null);
  const [factor, setFactor] = useState(status.factors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function enroll() {
    setBusy(true); setError("");
    try { const result = await staffMfaEnrollFn(); setSetup(result); setFactor(result.id); }
    catch (e) { setError(e instanceof Error ? e.message : "Setup failed"); }
    finally { setBusy(false); }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { const result = await staffMfaVerifyFn({ data: { factorId: factor, code } }); setSetup(null); setCode(""); await router.invalidate(); await navigate({ to: result.role === "admin" ? "/admin" : "/admin/candidates" }); }
    catch (e) { setError(e instanceof Error ? e.message : "Verification failed"); setCode(""); }
    finally { setBusy(false); }
  }
  return <div className="w-full max-w-[420px]"><h1 className="font-display text-3xl mb-4">Verify your authenticator</h1>
    <p className="text-ink-soft mb-5">Staff access requires a code from your authenticator app.</p>
    {!factor && <button disabled={busy} onClick={enroll} className="bg-ink text-paper rounded p-3">Set up authenticator</button>}
    {setup && <div className="mb-4"><p>Scan this code in your authenticator app. Keep the setup key private.</p><img src={setup.qrCode} alt="Authenticator setup QR code" className="w-52 h-52 my-4" /><details><summary>Enter the key manually</summary><code className="break-all">{setup.secret}</code></details></div>}
    {!!factor && <form onSubmit={verify} className="space-y-4">
      {status.factors.length > 1 && <label className="block">Authenticator<select value={factor} onChange={e => setFactor(e.target.value)}>{status.factors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
      <label className="block">Authentication code<input className="block w-full border border-rule rounded p-3 mt-2" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} /></label>
      <button disabled={busy} className="bg-ink text-paper rounded p-3 w-full">{busy ? "Verifying…" : "Verify code"}</button>
    </form>}
    {error && <p role="alert" className="text-red-700 mt-4">{error}</p>}
    <p className="text-sm text-ink-soft mt-5">Lost your authenticator? Ask the account owner to verify your identity and reset your enrollment.</p>
    <button className="underline mt-4" onClick={async () => { await adminLogoutFn(); await navigate({ to: "/admin/login" }); }}>Sign out</button>
  </div>;
}
