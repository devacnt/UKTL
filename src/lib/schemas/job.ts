import { z } from "zod";
import { SeniorityEnum } from "./profile.ts";

export const JobStatusEnum = z.enum(["open", "closed", "filled"]);
export type JobStatus = z.infer<typeof JobStatusEnum>;

export const JobSchema = z.object({
  id: z.string(),
  created_at: z.number(),
  title: z.string(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  seniority: SeniorityEnum.nullable().optional(),
  min_years_experience: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  must_have_skills: z.array(z.string()).default([]),
  nice_to_have_skills: z.array(z.string()).default([]),
  salary_min: z.number().nonnegative().nullable().optional(),
  salary_max: z.number().nonnegative().nullable().optional(),
  salary_currency: z.string().nullable().optional(),
  salary_period: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  posted_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  status: JobStatusEnum,
  source: z.string().nullable().optional(),
  filled_candidate_id: z.string().nullable().optional(),
  filled_candidate_name: z.string().nullable().optional(),
  filled_at: z.number().nullable().optional(),
  filled_note: z.string().nullable().optional(),
});
export type Job = z.infer<typeof JobSchema>;

export const MatchStageEnum = z.enum([
  "matched",
  "screening",
  "shortlisted",
  "interviewing",
  "offered",
  "placed",
  "rejected",
]);
export type MatchStage = z.infer<typeof MatchStageEnum>;
export const MATCH_STAGES = MatchStageEnum.options;

export const MatchSchema = z.object({
  candidate_id: z.string(),
  job_id: z.string(),
  score: z.number().min(0).max(100),
  skills_overlap: z.number().min(0).max(100),
  experience_fit: z.number().min(0).max(100),
  seniority_fit: z.number().min(0).max(100),
  location_fit: z.number().min(0).max(100),
  matched_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  reasoning: z.string(),
  computed_at: z.number(),
  stage: MatchStageEnum,
  stage_updated_at: z.number().nullable(),
});
export type Match = z.infer<typeof MatchSchema>;

// What the scorer produces; stage is owned by consultants, not the matcher.
export type MatchScore = Omit<Match, "candidate_id" | "computed_at" | "stage" | "stage_updated_at">;
