import {completeAccountErasure} from '../src/lib/server/account-erasure.ts';
import {operationsSnapshot,eraseCandidateRecord} from '../src/lib/server/operations.ts';
import {exportOwnData,requestPrivacyAction} from '../src/lib/server/privacy.ts';
import postgres from 'postgres';
import assert from 'node:assert/strict';
import {postgresQuery} from '../src/lib/server/postgres.ts';
import {registerQueuedCv,activateQueuedCv,processNextCv,saveProfileRevision} from '../src/lib/server/processing.ts';
import {getMatchesForCandidate,getMatchesForJob} from '../src/lib/server/db.ts';
import {inspectUploadReconciliation} from '../src/lib/server/upload-reconciliation.ts';
import {refreshMatchBatch,assessMatchEvidence} from '../src/lib/server/match-evidence.ts';
const url=process.env.TEST_DATABASE_URL??'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if(!['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw new Error('Only the isolated local database may be used');
const sql=postgres(url,{max:1,prepare:false});
const originalFetch=globalThis.fetch;
class Rollback extends Error{}
try{await sql.begin(async tx=>{
  await tx`SET LOCAL search_path=recruitment,public`;
  const user=crypto.randomUUID(),candidate=crypto.randomUUID(),job=crypto.randomUUID();
  await tx`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${user},${user+'@example.invalid'},now())`;
  await tx`INSERT INTO jobs(id,created_at,title,status,must_have_skills) VALUES(${job},1,'Worker fixture','open','["python"]')`;
  const env={DATA_BACKEND:'supabase',ANTHROPIC_API_KEY:'fake-test-key',DB:{
    prepare(query:string){let values:unknown[]=[];return {
      bind(...args:unknown[]){values=args;return this;},
      async execute(connection?:typeof tx){const q=postgresQuery(query,values);const run=(c:typeof tx)=>c.unsafe(q.sql,q.values as any[]);return connection?run(connection):tx.savepoint(run);},
      async first(){return (await this.execute())[0]??null;},async all(){return {success:true,results:await this.execute()};},async run(){return {success:true,results:await this.execute()};},
    };},
    async batch(statements:any[]){return tx.savepoint(async sub=>{const results=[];for(const statement of statements)results.push({success:true,results:await statement.execute(sub)});return results;});},
  },CV_BUCKET:{async get(){const bytes=new TextEncoder().encode('Fixture candidate, Python engineer.').buffer;return {size:bytes.byteLength,async arrayBuffer(){return bytes;}};}}} as any;
  const args={id:candidate,filename:'fixture.txt',r2Key:`cvs/${candidate}/fixture.txt`,sizeBytes:40,authUserId:user};
  await registerQueuedCv(env,args);
  assert.equal((await processNextCv(env)).status,'idle','storage grace period respected');
  await assert.rejects(registerQueuedCv(env,args));
  await activateQueuedCv(env,candidate);
  const profile={name:'Extracted',skills:[{skill:'JS',years_experience:2},{skill:'JavaScript',years_experience:3},{skill:'Python',years_experience:7}],experience:[],education:[]};
  const quality={score:50,notes:[],breakdown:{contact_information:50,experience:50,skills:50,education:50,clarity:50},improvement_report:{contact_information:'Fixture',experience:'Fixture',skills:'Fixture',education:'Fixture',clarity:'Fixture',overall:'Fixture'}};
  let requests=0;
  globalThis.fetch=async()=>Response.json({content:[{type:'text',text:JSON.stringify(++requests===1?profile:quality)}]});
  assert.equal((await processNextCv(env)).status,'succeeded');
  assert.equal(requests,2);
  assert.equal((await tx`SELECT status FROM candidates WHERE id=${candidate}`)[0].status,'parsed');
  assert.equal(Number((await tx`SELECT years_experience FROM candidate_skills WHERE candidate_id=${candidate} AND skill='python'`)[0].years_experience),7);
  await tx`UPDATE matches SET stage='shortlisted' WHERE candidate_id=${candidate} AND job_id=${job}`;
  await tx`UPDATE jobs SET must_have_skills='["Rust"]' WHERE id=${job}`;
  const fresh=(await getMatchesForCandidate(env,candidate)).find(m=>m.job_id===job)!;
  assert.equal(fresh.score,0);assert.equal(fresh.stage,'shortlisted');
  const staffFresh=(await getMatchesForJob(env,job)).find(m=>m.candidate_id===candidate)!;
  assert.equal(staffFresh.score,0);assert.equal(staffFresh.stage,'shortlisted');
  assert.equal(Number((await tx`SELECT score FROM matches WHERE candidate_id=${candidate} AND job_id=${job}`)[0].score),50);
  const newJob=crypto.randomUUID();
  await tx`INSERT INTO jobs(id,created_at,title,status,must_have_skills) VALUES(${newJob},2,'New import','open','["python"]')`;
  assert.equal((await getMatchesForCandidate(env,candidate)).find(m=>m.job_id===newJob)!.score,50);
  assert.equal((await tx`SELECT count(*)::int AS n FROM matches WHERE candidate_id=${candidate} AND job_id=${newJob}`)[0].n,0);
  assert.equal((await refreshMatchBatch(env)).saved,2);
  assert.equal((await tx`SELECT stage FROM matches WHERE candidate_id=${candidate} AND job_id=${job}`)[0].stage,'shortlisted');
  const gradeFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({requirements:[{index:0,status:'not_established',quote:''}]})}]});
  assert.equal((await assessMatchEvidence(env,candidate,job)).requirements[0].status,'not_established');
  globalThis.fetch=async()=>{throw new Error('Cache should avoid repeat AI calls');};
  assert.equal((await assessMatchEvidence(env,candidate,job)).version,'evidence-review-v1');
  await tx`UPDATE jobs SET title='Changed before review' WHERE id=${job}`;
  globalThis.fetch=async()=>{await tx`UPDATE jobs SET title='Changed during review' WHERE id=${job}`;return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({requirements:[{index:0,status:'not_established',quote:''}]})}]});};
  await assert.rejects(assessMatchEvidence(env,candidate,job));
  globalThis.fetch=gradeFetch;
  await saveProfileRevision(env,candidate,user,0,{...profile,name:'Corrected',languages:[],certifications:[],links:{}});
  assert.equal((await tx`SELECT quality_score FROM candidates WHERE id=${candidate}`)[0].quality_score,null);
  assert.equal((await processNextCv(env)).status,'succeeded');
  assert.equal((await tx`SELECT stage FROM matches WHERE candidate_id=${candidate} AND job_id=${job}`)[0].stage,'shortlisted');
  assert.equal((await tx`SELECT name FROM candidates WHERE id=${candidate}`)[0].name,'Corrected');
  assert.equal(requests,3,'correction only regrades, never re-extracts original CV');
  await tx`SELECT recruitment.revise_cv_profile(${candidate},${user}::uuid,1,${JSON.stringify({...profile,name:'Second correction'})})`;
  // Simulate another tab saving while an AI request is in flight.
  globalThis.fetch=async()=>{
    await tx`SELECT recruitment.revise_cv_profile(${candidate},${user}::uuid,2,${JSON.stringify({...profile,name:'Newest correction'})})`;
    return Response.json({content:[{type:'text',text:JSON.stringify(quality)}]});
  };
  assert.equal((await processNextCv(env)).status,'deferred_or_failed');
  const newest=(await tx`SELECT name,profile_revision,status,quality_score FROM candidates WHERE id=${candidate}`)[0];
  assert.equal(newest.name,'Newest correction');assert.equal(newest.profile_revision,3);assert.equal(newest.status,'uploaded');assert.equal(newest.quality_score,null);
  assert.equal((await tx`SELECT status FROM processing_jobs WHERE candidate_id=${candidate} AND profile_revision=3`)[0].status,'pending');
  globalThis.fetch=async()=>{throw new Error('secret private CV provider body');};
  assert.equal((await processNextCv(env)).status,'deferred_or_failed');
  const failed=(await tx`SELECT status,last_error,attempts FROM processing_jobs WHERE candidate_id=${candidate} AND profile_revision=3`)[0];
  assert.equal(failed.status,'pending');assert.equal(failed.attempts,1);assert.ok(!failed.last_error.includes('secret'));
  // Isolated metadata fixtures only: no object bytes or production Storage writes.
  const orphanId=crypto.randomUUID(),versionId=crypto.randomUUID(),recentId=crypto.randomUUID();
  const versionKey=`cvs/${candidate}/old-version.txt`;
  await tx`INSERT INTO storage.objects(id,bucket_id,name,created_at,updated_at) VALUES
    (${orphanId},'uktl-cvs',${`cvs/${orphanId}/fixture.txt`},now()-interval '48 hours',now()-interval '48 hours'),
    (${versionId},'uktl-cvs',${versionKey},now()-interval '48 hours',now()-interval '48 hours'),
    (${recentId},'uktl-cvs',${`cvs/${recentId}/fixture.txt`},now(),now())`;
  await tx`INSERT INTO cv_versions(id,candidate_id,version,storage_key,filename,content_type,size_bytes,created_at)
    VALUES(${crypto.randomUUID()},${candidate},2,${versionKey},'fixture.txt','text/plain',1,1)`;
  const missingId=crypto.randomUUID();
  await tx`INSERT INTO candidates(id,created_at,updated_at,status,source_r2_key)
    VALUES(${missingId},1,1,'failed',${`cvs/${missingId}/missing.txt`})`;
  await tx`UPDATE candidates SET created_at=1,updated_at=1 WHERE id=${candidate}`;
  const report=await inspectUploadReconciliation(env);
  assert.ok(report.orphanObjects.some(o=>o.id===orphanId));
  assert.ok(!report.orphanObjects.some(o=>o.id===versionId||o.id===recentId));
  assert.ok(report.missingFiles.some(c=>c.id===missingId));
  assert.ok(!report.missingFiles.some(c=>c.id===candidate),'pending task protects active candidate');
  assert.equal((await tx`SELECT count(*)::int AS n FROM storage.objects WHERE id=${orphanId}`)[0].n,1);
  const snapshot=await operationsSnapshot(env);
  assert.ok(snapshot.audit.length>0);assert.ok(snapshot.usage.length>0);
  const ownExport=await exportOwnData(env,user);
  assert.equal(ownExport.data.candidates.length,1);
  assert.equal((ownExport.data.candidates[0] as any).id,candidate);
  assert.ok(!('source_r2_key' in (ownExport.data.candidates[0] as any)));
  await requestPrivacyAction(env,user,'erasure');await requestPrivacyAction(env,user,'erasure');
  assert.equal((await tx`SELECT count(*)::int AS n FROM privacy_requests WHERE user_id=${user}`)[0].n,1);
  const deletedKeys:string[]=[];env.CV_BUCKET.delete=async(key:string)=>{deletedKeys.push(key);};
  assert.equal((await eraseCandidateRecord(env,candidate,user)).status,'completed');
  assert.equal(deletedKeys.length,2);
  assert.equal((await tx`SELECT count(*)::int AS n FROM candidates WHERE id=${candidate}`)[0].n,0);
  assert.equal((await tx`SELECT count(*)::int AS n FROM processing_jobs WHERE candidate_id=${candidate}`)[0].n,0);
  assert.equal((await tx`SELECT status FROM file_deletions WHERE candidate_id=${candidate}`)[0].status,'completed');
  const request=(await tx`SELECT id FROM privacy_requests WHERE user_id=${user} AND kind='erasure'`)[0].id;
  const actor=crypto.randomUUID();await tx`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${actor},${actor+'@example.invalid'},now())`;
  const erasing=await completeAccountErasure(env,request,actor,true,{deleteUser:async()=>({error:{status:503}})});
  assert.equal(erasing.status,'pending');
  assert.equal((await tx`SELECT target_user_id FROM account_erasures WHERE request_id=${request}`)[0].target_user_id,user);
  await assert.rejects(registerQueuedCv(env,{...args,id:crypto.randomUUID()}),'tombstone blocks in-flight owner writes');
  const erased=await completeAccountErasure(env,request,actor,true,{deleteUser:async(id)=>{await tx`DELETE FROM auth.users WHERE id=${id}`;return {error:null};}});
  assert.equal(erased.status,'completed');
  assert.equal((await tx`SELECT count(*)::int AS n FROM auth.users WHERE id=${user}`)[0].n,0);
  assert.equal((await tx`SELECT target_user_id FROM account_erasures WHERE request_id=${request}`)[0].target_user_id,null);
  assert.equal((await tx`SELECT status FROM privacy_requests WHERE id=${request}`)[0].status,'completed');
  throw new Rollback();
});throw new Error('Fixtures were not rolled back');}catch(e){if(!(e instanceof Rollback))throw e;}finally{globalThis.fetch=originalFetch;await sql.end();}
console.log('PASS: actual worker registration, activation, parse/grade, skill mapping, preserved stages, edit refresh, stale-result rejection and private retry errors; all fixtures rolled back');
