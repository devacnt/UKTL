import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { chooseAccountRoleFn } from "@/lib/account-functions";
export function AccountType({role}: {role:"candidate"|"employer"}) {
  const router=useRouter(); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  async function change(){setBusy(true);setError("");try{const next=role==="candidate"?"employer":"candidate";await chooseAccountRoleFn({data:{role:next}});await router.invalidate();await router.navigate({href:next==="employer"?"/employer":"/app"});}catch(e){setError(e instanceof Error?e.message:"Unable to change account type");}finally{setBusy(false);}}
  return <section className="border border-rule rounded-lg p-5 my-6"><h2 className="font-display text-xl">Account type: {role}</h2><p className="text-sm my-3 text-ink-soft">Candidate accounts manage their own CV and job interests. Employer accounts can contact UKTL about hiring; they cannot access candidate records or staff tools.</p><button disabled={busy} onClick={change} className="min-h-11 underline">{busy?"Saving…":`Switch to ${role==="candidate"?"employer":"candidate"} account`}</button>{error&&<p role="alert">{error}</p>}</section>;
}
