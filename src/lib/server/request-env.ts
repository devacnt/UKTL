import { getEnv } from "./env";
import { createDatabase } from "./database";
import { getCandidateSession } from "../supabase";
// Attribution is derived only from the server-verified session, never input/metadata.
// This helper is not an authorization boundary; each handler must still authorize.
export async function getRequestEnv() {
  const env = await getEnv();
  if (env.DATA_BACKEND !== "supabase") return env;
  const session = await getCandidateSession();
  let database: D1Database | undefined;
  return Object.create(env, {
    DB: { get: () => (database ??= createDatabase(env, session.userId)), enumerable: true },
  }) as typeof env;
}
