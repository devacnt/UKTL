import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAuthenticatedSupabase } from "./supabase";
import { readStaffAccess } from "./server/staff-access";
import { getRequestEnv } from "./server/request-env";
import { requireViewer } from "./server/viewer";
export const chooseAccountRoleFn = createServerFn({method:"POST"})
  .inputValidator((raw:unknown)=>z.object({role:z.enum(["candidate","employer"])}).parse(raw))
  .handler(async({data})=>{
    const viewer=await requireViewer();
    const {client}=await getAuthenticatedSupabase();
    if ((await readStaffAccess(client)).role) throw new Error("Staff membership is managed by the administrator");
    const {error}=await client.from("account_roles").upsert({user_id:viewer.userId,role:data.role});
    if(error)throw new Error("Account type could not be saved");
    return {role:data.role};
  });
export const cvHistoryFn = createServerFn({method:"GET"}).handler(async()=>{
  const viewer=await requireViewer();
  if(viewer.isEmployer && !viewer.isStaff) throw new Error("Candidate account required");
  const env=await getRequestEnv();
  const result=await env.DB.prepare(`SELECT id,source_filename,created_at,status FROM candidates WHERE auth_user_id=? ORDER BY created_at DESC,id DESC LIMIT 100`).bind(viewer.userId)
    .all<{id:string;source_filename:string|null;created_at:number;status:string}>();
  return (result.results??[]).map(r=>({...r,created_at:Number(r.created_at)}));
});
