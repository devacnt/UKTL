export type AccountRole = "candidate" | "employer";
export function accountDestination(session: {staffRole?: "admin" | "consultant" | null; isStaff?: boolean; accountRole?: AccountRole}, requested?: string) {
  if (session.staffRole && !session.isStaff) return "/auth/security";
  if (session.isStaff) return session.staffRole === "consultant" ? "/admin/candidates" : "/admin";
  if (session.accountRole === "employer") return "/employer";
  return requested;
}
