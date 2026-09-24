import test from "node:test";
import assert from "node:assert/strict";
import { filterJobs } from "../src/lib/job-search.ts";
import type { Job } from "../src/lib/schemas/job.ts";
const roles: Job[] = [
  {id:"1",created_at:1,title:"Site Manager",location:"London",company:"Build",must_have_skills:["Safety"],nice_to_have_skills:[],status:"open"},
  {id:"2",created_at:2,title:"Engineer",location:null,must_have_skills:["TypeScript"],nice_to_have_skills:[],status:"open"},
];
test("list and swipe filters combine case-insensitive terms and location", () => {
  assert.deepEqual(filterJobs(roles,"  SITE safety ","LONDON").map(j=>j.id),["1"]);
  assert.deepEqual(filterJobs(roles,"TypeScript","London"),[]);
  assert.equal(filterJobs(roles,""," ").length,2);
  assert.equal(filterJobs(roles,"missing","" ).length,0);
});
