import { useEffect, useState } from "react";
import { ReedApply } from "@/components/app/ReedApply";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getCandidateSessionFn, getSwipeHistoryFn, undoSwipeFn } from "@/lib/functions";
export const Route = createFileRoute("/app/activity")({
  beforeLoad: async () => { if (!(await getCandidateSessionFn()).userId) throw redirect({to:"/auth/login"}); },
  loader: () => getSwipeHistoryFn({data:{}}), component: ActivityPage,
});
function ActivityPage() {
  const initial = Route.useLoaderData();
  const [items,setItems] = useState(initial.items);
  const [cursor,setCursor] = useState(initial.nextCursor);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [savedOnly,setSavedOnly] = useState(true);
  useEffect(()=>{setItems(initial.items);setCursor(initial.nextCursor);},[initial]);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);setError("");
    try {const page=await getSwipeHistoryFn({data:{cursor}});setItems(old=>[...old,...page.items.filter(i=>!old.some(o=>o.candidate_id===i.candidate_id && o.job_id===i.job_id))]);setCursor(page.nextCursor);}
    catch {setError("Unable to load more decisions. Please try again.");} finally {setBusy(false);}
  }
  async function undo(item:typeof items[number]) {
    setBusy(true);setError("");
    try {await undoSwipeFn({data:{candidateId:item.candidate_id,jobId:item.job_id,swipedAt:item.swiped_at}});setItems(old=>old.filter(i=>!(i.candidate_id===item.candidate_id&&i.job_id===item.job_id)));}
    catch (e) {setError(e instanceof Error ? e.message : "Unable to undo. Please retry.");} finally {setBusy(false);}
  }
  return <div className="max-w-3xl"><h1 className="font-display text-4xl">Your interests and history</h1>
    <p className="text-ink-soft my-4">Your saved recruitment decisions, newest first. Expressing interest lets UKTL review your profile; it does not submit an application to an external employer.</p>
    <Link to="/app/discover" className="underline">Discover more roles</Link>
    {error && <p role="alert" className="text-red-700 my-4">{error}</p>}
    {!items.length && <p className="my-8">No saved decisions yet.</p>}
    <label className="flex gap-3 items-center min-h-11 my-3"><input type="checkbox" checked={savedOnly} onChange={e=>setSavedOnly(e.target.checked)} />Show saved jobs only</label>
    <ul className="my-6 space-y-4">{items.filter(item=>!savedOnly || item.action==='interested').map(item=><li key={`${item.candidate_id}:${item.job_id}`} className="border border-rule rounded p-5">
      <div className="text-sm text-ink-mute">{item.action === "interested" ? "Interested" : "Dismissed"} · {new Date(item.swiped_at).toISOString().slice(0,10)}{item.status !== "open" && " · Role closed"}</div>
      <Link to="/app/jobs/$id" params={{id:item.job_id}} className="font-display text-2xl underline">{item.title}</Link>
      <p className="text-ink-soft my-2">{item.company ?? "Confidential"}{item.location ? ` · ${item.location}` : ""}</p>
      <ReedApply job={item} />
      <button disabled={busy} onClick={()=>undo(item)} className="underline text-sm disabled:opacity-50">{item.action === "interested" ? "Withdraw interest" : "Undo dismissal"}</button>
    </li>)}</ul>
    {cursor && <button disabled={busy} onClick={more} className="border border-rule rounded px-5 py-2">{busy ? "Loading…" : "Load more"}</button>}
  </div>;
}
