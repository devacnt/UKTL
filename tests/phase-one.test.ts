import {test} from "node:test";
import assert from "node:assert/strict";
import {reedApplicationUrl} from "../src/lib/reed-link.ts";
import {normaliseReedJob} from "../src/lib/server/reed.ts";
import {accountDestination} from "../src/lib/account-role.ts";
import {canAccessCandidate} from "../src/lib/server/access-policy.ts";
test("Reed expiry caps missing or distant dates and respects earlier closure",()=>{
 const now=new Date("2026-10-13T12:00:00Z");
 const job={jobTitle:"Software developer",datePosted:"01/10/2026"};
 assert.equal(normaliseReedJob(job,1,"technology",now)?.expiry,"2026-10-31");
 assert.equal(normaliseReedJob({...job,expirationDate:"01/01/2027"},1,"technology",now)?.expiry,"2026-10-31");
 assert.equal(normaliseReedJob({...job,expirationDate:"20/10/2026"},1,"technology",now)?.expiry,"2026-10-20");
 assert.equal(normaliseReedJob({jobTitle:job.jobTitle},1,"technology",now)?.expiry,"2026-11-12");
});
test("external apply rejects attacker URLs and closed/expired jobs",()=>{
 const job={source:"reed",status:"open",source_url:"https://www.reed.co.uk/jobs/software/123"};
 assert.equal(reedApplicationUrl(job),job.source_url);
 for(const source_url of ["javascript:alert(1)","https://reed.co.uk.evil.test/jobs/1","https://evil@reed.co.uk/jobs/1","https://reed.co.uk:444/jobs/1"]){assert.equal(reedApplicationUrl({...job,source_url}),null);}
 assert.equal(reedApplicationUrl({...job,status:"closed"}),null);
 assert.equal(reedApplicationUrl({...job,expiry_date:"2026-01-01"},"2026-10-13"),null);
});
test("main sign-in preserves MFA and separates employer from candidate",()=>{
 assert.equal(accountDestination({staffRole:"admin",isStaff:false},"/app"),"/auth/security");
 assert.equal(accountDestination({staffRole:"admin",isStaff:true}),"/admin");
 assert.equal(accountDestination({accountRole:"employer"},"/app/upload"),"/employer");
 assert.equal(canAccessCandidate({isAdmin:false,isEmployer:true,userId:"owner"},"owner"),false);
 assert.equal(canAccessCandidate({isAdmin:false,userId:"owner"},"owner"),true);
});
