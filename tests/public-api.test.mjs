import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../server/api.ts';
import {SQLiteStore} from '../server/sqlite.mjs';
import {SAMPLE_CASES} from '../lib/fixtures.ts';
async function setup(){const store=new SQLiteStore(':memory:');let cookie='',provider='ok',calls=[];const transport=async(url,options)=>{calls.push({url,options});if(provider==='slow')await new Promise(r=>setTimeout(r,30));if(provider==='offline')throw new Error('offline');if(provider==='bad')return new Response('error',{status:401});if(provider==='rate')return new Response('error',{status:429});if(url.endsWith('/models'))return Response.json({data:[{id:'test-model'}]});return Response.json({choices:[{message:{content:provider==='empty'?'':'Tokyo'},finish_reason:provider==='truncated'?'length':'stop'}]});};
 const request=async(body,options={})=>{const headers={'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(options.origin?{Origin:options.origin}:{})};const r=await handleApi(new Request('https://gaplab.test/api/workspace'+(options.query??''),{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),store,transport);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;};
 const get=async()=>await(await request()).json();
 const post=async b=>{const s=await get();return request({revision:s.revision,...b});};
 const seed=async()=>post({action:'import',dataset:SAMPLE_CASES.slice(0,4)});
 const candidate=async()=>{const r=await post({action:'save_prompt',name:'Candidate',prompt:'Return only the requested answer.'});return(await r.json()).versions.at(-1).id;};
 const start=async()=>{await seed();const improvedId=await candidate();return post({action:'start_live',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',apiKey:'fake-test-only-123',model:'test-model',baselineId:'v1',improvedId});};
 return{store,get,post,request,seed,candidate,start,calls,provider:m=>provider=m,cookie:()=>cookie};}
test('anonymous browser opens empty workspace, with secure HttpOnly cookie and no login',async()=>{const h=await setup();const r=await h.request(),s=await r.json();assert.equal(r.status,200);assert.equal(s.dataset.length,0);assert.equal(s.runs.length,0);assert(r.headers.get('set-cookie').includes('HttpOnly'));assert(r.headers.get('set-cookie').includes('Secure'));assert.equal(r.headers.get('Cache-Control'),'private, no-store');h.store.close();});
test('cookies are unguessable and raw session tokens are not stored',async()=>{const h=await setup();await h.get();const token=h.cookie().split('=')[1];assert.equal(token.length,64);const rows=h.store.db.prepare('SELECT key,value FROM public_records').all();assert(!JSON.stringify(rows).includes(token));h.store.close();});
test('draft dataset supports first case and empty draft but evaluation requires both splits',async()=>{const h=await setup();assert.equal((await h.post({action:'import',dataset:[SAMPLE_CASES[0]]})).status,200);assert.equal((await h.post({action:'run',mode:'replay',baselineId:'v1',improvedId:'v1'})).status,400);assert.equal((await h.post({action:'import',dataset:[]})).status,200);h.store.close();});
test('invalid imports and stale revisions preserve existing dataset',async()=>{const h=await setup();await h.seed();assert.equal((await h.post({action:'import',dataset:[{id:'x'}]})).status,400);assert.equal((await h.post({action:'import',dataset:[],revision:0})).status,409);assert.equal((await h.get()).dataset.length,4);h.store.close();});
test('unknown dataset fields are stripped instead of persisted',async()=>{const h=await setup();await h.post({action:'import',dataset:[{...SAMPLE_CASES[0],secret:'should-be-dropped'}]});assert(!JSON.stringify(await h.get()).includes('should-be-dropped'));h.store.close();});
test('malformed requests, unknown actions, cross-origin writes and unsupported verbs rejected',async()=>{const h=await setup();for(const raw of ['{broken','[]','null'])assert.equal((await h.request(raw)).status,400);assert.equal((await h.post({action:'unknown'})).status,400);assert.equal((await h.request({action:'import',dataset:[]},{origin:'https://evil.test'})).status,403);assert.equal((await handleApi(new Request('https://gaplab.test/api/workspace',{method:'DELETE'}),h.store)).status,405);h.store.close();});
test('candidate versions retain baseline and data revision advances',async()=>{const h=await setup();const id=await h.candidate(),s=await h.get();assert.equal(s.versions.length,2);assert.equal(s.versions[1].id,id);assert.equal(s.versions[0].id,'v1');assert.equal(s.revision,1);h.store.close();});
test('saved-pair evaluation calculates metrics and retains immutable snapshot',async()=>{const h=await setup();await h.seed();const r=await h.post({action:'run',mode:'replay',baselineId:'v1',improvedId:'v1',name:'Test saved pairs'});assert.equal(r.status,201);const {report}=await r.json();assert.equal(report.metrics.before,2);assert.equal(report.metrics.after,4);await h.post({action:'import',dataset:[]});assert.equal((await h.get()).runs[0].pairs.length,4);assert(!Object.hasOwn(report.datasetSnapshot[0],'baseline'));h.store.close();});
test('manual responses require a complete pair for every case',async()=>{const h=await setup();await h.seed();assert.equal((await h.post({action:'run',mode:'manual',baselineId:'v1',improvedId:'v1',responses:{}})).status,400);const responses=Object.fromEntries(SAMPLE_CASES.slice(0,4).map(c=>[c.id,{baseline:c.baseline,improved:c.improved}]));assert.equal((await h.post({action:'run',mode:'manual',baselineId:'v1',improvedId:'v1',responses})).status,201);h.store.close();});
test('trash and restore are reversible; anonymous browsers cannot read or mutate each other',async()=>{const h=await setup();await h.seed();const{report}=await(await h.post({action:'run',mode:'replay',baselineId:'v1',improvedId:'v1'})).json();const other=await handleApi(new Request('https://gaplab.test/api/workspace?report='+report.id),h.store);assert.equal(other.status,404);await h.post({action:'delete_run',id:report.id});assert.equal((await h.get()).runs.length,0);assert.equal((await h.get()).trash.length,1);await h.post({action:'restore_run',id:report.id});assert.equal((await h.get()).runs.length,1);h.store.close();});
test('patch suggestions use a saved report after current dataset was replaced',async()=>{const h=await setup();await h.seed();const{report}=await(await h.post({action:'run',mode:'replay',baselineId:'v1',improvedId:'v1'})).json();await h.post({action:'import',dataset:[]});assert.equal((await h.post({action:'suggest',prompt:'Answer.'})).status,400);const r=await h.post({action:'suggest',prompt:'Answer.',reportId:report.id});assert.equal(r.status,200);assert((await r.json()).prompt.includes('Verify the final answer'));h.store.close();});
test('connection check lists provider models without generating tokens or persisting the key',async()=>{const h=await setup();const r=await h.post({action:'test_connection',apiKey:'fake-test-only-123'});assert.equal(r.status,200);assert.deepEqual((await r.json()).models,['test-model']);assert(h.calls[0].url.endsWith('/models'));assert(!JSON.stringify(h.store.db.prepare('SELECT value FROM public_records').all()).includes('fake-test-only-123'));h.store.close();});
test('live start is idempotent, requires different prompts and removes fixture responses',async()=>{const h=await setup();await h.seed();assert.equal((await h.post({action:'start_live',requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',apiKey:'fake-test-only-123',model:'test-model',baselineId:'v1',improvedId:'v1'})).status,400);const r=await h.start();assert.equal(r.status,201);const{job}=await r.json();assert.equal(job.completed,0);assert.equal(job.cases[0].baseline,undefined);assert.equal(h.calls.length,0);const s=await h.get();const again=await h.post({action:'start_live',requestId:job.id,apiKey:'fake-test-only-123',model:'test-model',baselineId:'v1',improvedId:s.versions.at(-1).id});assert.equal(again.status,200);assert.equal(h.store.db.prepare("SELECT count(*) n FROM public_records WHERE key LIKE 'job:%'").get().n,1);h.store.close();});
test('single live step checkpoints output and rejects stale duplicate step',async()=>{const h=await setup();const{job}=await(await h.start()).json();const r=await h.post({action:'step_live',id:job.id,expectedStep:0,apiKey:'fake-test-only-123'});assert.equal(r.status,200);const after=(await r.json()).job;assert.equal(after.completed,1);assert.equal(after.cases[0].baseline,'Tokyo');assert.equal(after.cases[0].improved,undefined);assert.equal((await h.post({action:'step_live',id:job.id,expectedStep:0,apiKey:'fake-test-only-123'})).status,409);assert.equal(h.calls.length,1);const body=JSON.parse(h.calls[0].options.body);assert.equal(body.messages.length,2);assert.equal(body.messages[1].content,SAMPLE_CASES[0].task);assert(!Object.hasOwn(body,'checks'));h.store.close();});
test('provider failure retains progress and retry resumes at next unsaved response',async()=>{const h=await setup();const{job}=await(await h.start()).json();await h.post({action:'step_live',id:job.id,expectedStep:0,apiKey:'fake-test-only-123'});h.provider('rate');assert.equal((await h.post({action:'step_live',id:job.id,expectedStep:1,apiKey:'fake-test-only-123'})).status,429);assert.equal((await h.get()).jobs[0].completed,1);h.provider('ok');assert.equal((await(await h.post({action:'step_live',id:job.id,expectedStep:1,apiKey:'fake-test-only-123'})).json()).job.completed,2);h.store.close();});
test('complete live run saves one report and repeat final call does not repeat model calls',async()=>{const h=await setup();const{job}=await(await h.start()).json();for(let n=0;n<job.total;n++)assert.equal((await h.post({action:'step_live',id:job.id,expectedStep:n,apiKey:'fake-test-only-123'})).status,200);assert.equal((await h.get()).runs.length,1);const count=h.calls.length;assert.equal((await h.post({action:'step_live',id:job.id,expectedStep:job.total,apiKey:'fake-test-only-123'})).status,200);assert.equal(h.calls.length,count);assert.equal((await h.get()).runs[0].mode,'live');h.store.close();});
test('bad empty truncated and unreachable provider responses never produce successful reports',async()=>{for(const mode of ['bad','empty','truncated','offline']){const h=await setup();const{job}=await(await h.start()).json();h.provider(mode);const r=await h.post({action:'step_live',id:job.id,expectedStep:0,apiKey:'fake-test-only-123'});assert(r.status>=400);assert.equal((await h.get()).jobs[0].completed,0);assert.equal((await h.get()).runs.length,0);h.store.close();}});
test('public workspaces do not reuse or expose prior authenticated private records',async()=>{const h=await setup();h.store.db.exec("CREATE TABLE workspaces(owner TEXT, dataset TEXT)");h.store.db.prepare('INSERT INTO workspaces VALUES(?,?)').run('private-owner','private-content');assert(!(JSON.stringify(await h.get())).includes('private-content'));h.store.close();});

test('concurrent tabs cannot process the same live step twice',async()=>{const h=await setup();const{job}=await(await h.start()).json();h.provider('slow');const body={action:'step_live',id:job.id,expectedStep:0,apiKey:'fake-test-only-123'};const responses=await Promise.all([h.request(body),h.request(body)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(h.calls.length,1);h.store.close();});

test('baseline collection uses only live training calls and supplies saved patch evidence', async t => {
 const h = await setup();
 t.after(() => h.store.close());
 await h.seed();
 const apiKey = 'fake-test-only-123';
 const start = await h.post({
  action: 'start_live', baselineOnly: true, apiKey, model: 'test-model',
  requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', baselineId: 'v1', improvedId: 'v1'
 });
 assert.equal(start.status, 201);
 const {job} = await start.json();
 assert.equal(job.total, 3);
 assert.equal(job.cases[0].baseline, undefined);
 const step = expectedStep => h.post({action: 'step_live', id: job.id, expectedStep, apiKey});
 assert.equal((await step(0)).status, 200);
 assert.equal((await h.get()).jobs[0].baselineOnly, true);
 assert.equal((await step(1)).status, 200);
 const finished = await (await step(2)).json();
 assert.equal(finished.job.status, 'complete');
 assert.equal(finished.report, undefined);
 assert.equal((await step(3)).status, 200);
 assert.equal(h.calls.length, 3);
 assert.deepEqual(h.calls.map(call => JSON.parse(call.options.body).messages[1].content),
  SAMPLE_CASES.slice(0, 3).map(c => c.task));
 await h.post({action: 'import', dataset: []});
 const state = await h.get();
 assert.equal(state.runs.length, 0);
 assert.equal(state.jobs.length, 0);
 assert.equal(state.baselineEvidence.pairs.length, 3);
 const patch = await h.post({action: 'suggest', jobId: job.id, prompt: 'Answer.'});
 assert.equal(patch.status, 200);
 assert.match((await patch.json()).prompt, /Verify the final answer/);
});
