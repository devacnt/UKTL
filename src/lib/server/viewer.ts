import { getCandidateSession, getAuthenticatedSupabase } from "../supabase";
import { hasStaffAccess, NO_STAFF_ACCESS, readStaffAccess } from "./staff-access";
import type { Viewer } from "./access-policy";
import { readAccountRole } from "./account-role";
export type { Viewer } from "./access-policy";
export async function getStaffAccess() {
  try { const { client } = await getAuthenticatedSupabase(); return await readStaffAccess(client); }
  catch { return NO_STAFF_ACCESS; }
}
export async function isAdminRequest(): Promise<boolean> { return hasStaffAccess(await getStaffAccess(), true); }
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminRequest())) throw new Error("Verified administrator with MFA required");
}
export async function requireStaff(): Promise<void> {
  if (!hasStaffAccess(await getStaffAccess())) throw new Error("Verified staff account with MFA required");
}
export async function getViewer(): Promise<Viewer> {
  const session = await getCandidateSession();
  const access = session.userId ? await getStaffAccess() : NO_STAFF_ACCESS;
  const isEmployer = session.userId ? (await readAccountRole((await getAuthenticatedSupabase()).client,session.userId)) === "employer" : false;
  return { isAdmin: hasStaffAccess(access, true), isStaff: hasStaffAccess(access), isEmployer, userId: session.userId,
    staffRole: access.mfa_verified ? access.role : null };
}
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer.userId) throw new Error("Please sign in to continue");
  return viewer;
}
export { canAccessCandidate } from "./access-policy";
