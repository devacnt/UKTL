import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppLayout";
import { AccountType } from "@/components/app/AccountType";
export const Route=createFileRoute("/employer")({
  beforeLoad:({context})=>{if(!context.session.userId)throw redirect({to:"/auth/login",search:{redirect:"/employer"}});if(context.session.accountRole!=="employer")throw redirect({to:"/app/profile"});},
  head:()=>({meta:[{title:"Employer account — UK Talent Link"},{name:"robots",content:"noindex, nofollow"}]}),
  component:()=> <AppShell><div className="max-w-xl"><h1 className="font-display text-4xl">Your employer account</h1><p className="my-5 text-ink-soft">Tell the UKTL team about the role you need to fill. Candidate introductions and shortlists are managed by the team.</p><Link to="/contact" className="inline-flex min-h-11 rounded-full bg-ink text-paper px-5 py-3">Discuss a hiring requirement</Link><AccountType role="employer" /></div></AppShell>,
});
