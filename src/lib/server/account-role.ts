import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountRole } from "../account-role.ts";
export async function readAccountRole(client: SupabaseClient, userId: string): Promise<AccountRole> {
  const { data, error } = await client.from("account_roles").select("role").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Account role verification unavailable");
  return data?.role === "employer" ? "employer" : "candidate";
}
