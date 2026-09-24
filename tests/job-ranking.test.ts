import { test } from "node:test";
import assert from "node:assert/strict";
import { rankProfiles, closingDate, QUALIFIED_SCORE } from "../src/lib/server/job-tools.ts";

const job = {
  id: "job_fixture", title: "Site Manager", created_at: 1, status: "open",
  must_have_skills: ["SMSTS", "CSCS"], nice_to_have_skills: ["NEBOSH"],
  min_years_experience: 5, seniority: "senior", location: "Leeds",
} as any;
const profile = (skills: string[], years: number, seniority: string, location: string) =>
  JSON.stringify({ skills: skills.map((skill) => ({ skill })), experience: [], education: [], total_years_experience: years, seniority, location });
const row = (id: string, raw: string, quality: number | null = null, stage: string | null = null) =>
  ({ id, name: id, headline: null, location: null, quality_score: quality, raw_profile: raw, stage });

test("candidates are ranked by job fit, then must-have coverage, then CV quality", () => {
  const { ranked, unreadable } = rankProfiles(job, [
    row("partial", profile(["SMSTS"], 10, "senior", "Leeds"), 90),
    row("perfect", profile(["SMSTS", "CSCS", "NEBOSH"], 8, "senior", "Leeds"), 40),
    row("tie-low", profile(["SMSTS", "CSCS"], 5, "senior", "Leeds"), 50),
    row("tie-high", profile(["SMSTS", "CSCS"], 5, "senior", "Leeds"), 80, "shortlisted"),
    row("none", profile([], 1, "junior", "Bristol")),
    row("broken", "{not json"),
  ]);
  assert.equal(unreadable, 1, "unreadable profiles are counted, never guessed");
  assert.deepEqual(ranked.map((r) => r.id), ["perfect", "tie-high", "tie-low", "partial", "none"]);
  assert.equal(ranked[0].score, 100);
  assert.equal(ranked[1].stage, "shortlisted");
  assert.ok(ranked[0].qualified && ranked[1].qualified);
  const partial = ranked.find((r) => r.id === "partial")!;
  assert.equal(partial.qualified, false, "a missing must-have is never qualified, whatever the score");
  assert.deepEqual(partial.missing_skills, ["cscs"]);
  assert.equal(partial.must_have_coverage, 0.5);
  assert.ok(ranked.at(-1)!.score < QUALIFIED_SCORE);
});

test("closing dates count calendar days across month ends", () => {
  assert.equal(closingDate("2026-01-31", 30), "2026-03-02");
  assert.equal(closingDate("2026-12-15", 30), "2027-01-14");
});
