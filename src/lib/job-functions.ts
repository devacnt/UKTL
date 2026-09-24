import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestEnv as getEnv } from "./server/request-env";
import { requireAdmin, requireStaff, requireViewer } from "./server/viewer";
import { rankCandidatesForJob, addToPipeline, fillJob, reopenJob } from "./server/job-tools";

const jobId = z.string().regex(/^[\w-]{1,100}$/);
const candidateId = z.string().min(1).max(100);

/** Ranks every parsed candidate in the database against one mandate. */
export const rankCandidatesFn = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        jobId,
        minScore: z.number().int().min(0).max(100).optional(),
        qualifiedOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .strict()
      .parse(raw),
  )
  .handler(async ({ data }) => {
    await requireStaff();
    const { jobId: id, ...opts } = data;
    return rankCandidatesForJob(await getEnv(), id, opts);
  });

export const addToPipelineFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ jobId, candidateIds: z.array(candidateId).min(1).max(100) }).strict().parse(raw),
  )
  .handler(async ({ data }) => {
    await requireStaff();
    return addToPipeline(await getEnv(), data.jobId, data.candidateIds);
  });

export const fillJobFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ jobId, candidateId, note: z.string().trim().max(1000).optional() }).strict().parse(raw),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const viewer = await requireViewer();
    return fillJob(await getEnv(), data.jobId, data.candidateId, viewer.userId!, data.note);
  });

export const reopenJobFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({ jobId, expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() })
      .strict()
      .parse(raw),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    return reopenJob(await getEnv(), data.jobId, data.expiryDate);
  });
