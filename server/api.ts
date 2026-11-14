import {BASE_PROMPT} from '../lib/fixtures.ts';
import {validateDataset,pairCases,metrics,gaps,refine,type Case} from '../lib/engine.ts';
import type {RecordStore} from './store.ts';
type Version={id:string;name:string;prompt:string;source:string;createdAt:string};
type Workspace={dataset:Case[];versions:Version[];runIds:string[];jobIds:string[]};
type Report=ReturnType<typeof reportFor>;
type Job={baselineOnly?:boolean;id:string;name:string;model:string;createdAt:string;cases:Case[];baselineVersion:Version;improvedVersion:Version;completed:number;total:number;status:'paused'|'complete'|'archived';error?:string;lease:number};
type GroqModels = { data?: unknown };
type GroqCompletion = { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }> };
function withoutResponses(c: Case): Omit<Case, 'baseline' | 'improved'> {
 const snapshot = {...c};
 delete snapshot.baseline;
 delete snapshot.improved;
 return snapshot;
}
class ApiError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status;}}
const initial=():Workspace=>({dataset:[],versions:[{id:'v1',name:'Baseline',prompt:BASE_PROMPT,source:'Initial baseline',createdAt:new Date().toISOString()}],runIds:[],jobIds:[]});
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).length;
function keyCheck(key:unknown){if(typeof key!=='string'||key.trim().length<12||key.length>300)throw new ApiError('Enter a valid Groq API key in AI connection.');return key.trim();}
async function groq<T>(key:string,path:string,body?:unknown,transport:typeof fetch=fetch){let r:Response;try{r=await transport('https://api.groq.com/openai/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});}catch{throw new ApiError('The AI provider could not be reached. Saved progress is retained; try resuming.',502);}if(!r.ok)throw new ApiError(r.status===401?'The API key was rejected. Check your key in AI connection.':r.status===429?'Provider quota or rate limit reached. Wait and resume your evaluation.':`AI provider returned HTTP ${r.status}. Check your model ID, key and provider account.`,r.status===429?429:502);try{return await r.json() as T;}catch{throw new ApiError('The provider returned invalid JSON.',502);}}
function reportFor(id:string,name:string,mode:string,cases:Case[],baselineVersion:Version,improvedVersion:Version,model:string|null=null){const pairs=pairCases(cases);return{id,name,createdAt:new Date().toISOString(),mode,model,baselineVersion,improvedVersion,promptEffectMeasured:mode==='live',pairs,metrics:metrics(pairs),train:metrics(pairs.filter(p=>p.split==='train')),holdout:metrics(pairs.filter(p=>p.split==='holdout')),gaps:gaps(pairs),datasetSnapshot:cases.map(withoutResponses),temperature:mode==='live'?0:null,evaluatorVersion:'2.0.0',note:mode==='live'?'New model responses. One paired trial per case; deterministic checks are task-specific proxies.':mode==='manual'?'User-supplied response pairs; model identity and conditions are not independently verified.':'Saved response pairs were re-evaluated. Selected prompts do not generate these outputs.'};}
export async function handleApi(request:Request,store:RecordStore,transport:typeof fetch=fetch):Promise<Response>{
 let cookie='';const headers=new Headers({'Cache-Control':'private, no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff','Vary':'Cookie'});
 const send=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
 try{
  const url=new URL(request.url);if(!['GET','POST'].includes(request.method)){headers.set('Allow','GET, POST');return send({error:'Method not allowed.'},405);}
  const origin=request.headers.get('origin');if(request.method==='POST'&&origin&&origin!==url.origin)throw new ApiError('Cross-origin writes are not allowed.',403);
  const match=/(?:^|;\s*)gaplab_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie')??'');cookie=match?.[1]??crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  if(!match)headers.set('Set-Cookie',`gaplab_session=${cookie}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${url.protocol==='https:'?'; Secure':''}`);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cookie)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const wk='workspace:'+hash,rk=(id:string)=>'run:'+hash+':'+id,jk=(id:string)=>'job:'+hash+':'+id;
  await store.create(wk,initial());const row=await store.read(wk);if(!row)throw new ApiError('Workspace could not be opened.',500);const w=row.value as Workspace;
  const getRun=async(id:unknown)=>{if(typeof id!=='string')throw new ApiError('Select a report.');const r=await store.read(rk(id));if(!r)throw new ApiError('Report not found.',404);return {row:r,data:r.value as {report:Report;trashed:boolean}};};
  const getJob=async(id:unknown)=>{if(typeof id!=='string')throw new ApiError('Select an evaluation.');const r=await store.read(jk(id));if(!r)throw new ApiError('Evaluation not found.',404);return {row:r,job:r.value as Job};};
  const index=async(field:'runIds'|'jobIds',id:string)=>{for(let i=0;i<6;i++){const r=await store.read(wk);const current=r!.value as Workspace;if(current[field].includes(id))return;const next={...current,[field]:[id,...current[field]].slice(0,100)};if(await store.write(wk,next,r!.revision))return;}throw new ApiError('Workspace is busy. Reload and retry.',409);};
  const saveReport=async(report:Report)=>{if(bytes(report)>1500000)throw new ApiError('Report is too large. Split the dataset into smaller evaluations.');await store.create(rk(report.id),{report,trashed:false});await index('runIds',report.id);};
  if(request.method==='GET'){
   const reportId=url.searchParams.get('report');if(reportId)return send({report:(await getRun(reportId)).data.report});
   const records=await Promise.all(w.runIds.slice(0,30).map(id=>store.read(rk(id))));const runs=records.filter(Boolean).map(r=>r!.value as {report:Report;trashed:boolean});
   const jobs=[];let baselineEvidence;for(const id of w.jobIds.slice(0,20)){const r=await store.read(jk(id));if(r){const j=r.value as Job;if(j.status==='paused')jobs.push({id:j.id,name:j.name,model:j.model,completed:j.completed,total:j.total,error:j.error,baselineOnly:!!j.baselineOnly});if(!baselineEvidence&&j.baselineOnly&&j.status==='complete')baselineEvidence={id:j.id,name:j.name,model:j.model,version:j.baselineVersion,pairs:pairCases(j.cases.filter(c=>c.split==='train'))};}}
   return send({dataset:w.dataset,versions:w.versions,revision:row.revision,runs:runs.filter(r=>!r.trashed).map(r=>r.report),trash:runs.filter(r=>r.trashed).map(r=>r.report),jobs,baselineEvidence});
  }
  const raw=await request.text();if(raw.length>2000000)throw new ApiError('Request exceeds 2 MB.',413);let payload:unknown;try{payload=JSON.parse(raw);}catch{throw new ApiError('Request must be valid JSON.');}if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new ApiError('Request must be an object.');const b=payload as Record<string,unknown>;
  const selectVersions=()=>{const baselineVersion=w.versions.find(v=>v.id===b.baselineId),improvedVersion=w.versions.find(v=>v.id===b.improvedId);if(!baselineVersion||!improvedVersion)throw new ApiError('Select valid saved prompt versions.');return{baselineVersion,improvedVersion};};
  const validRunDataset=()=>{try{validateDataset(w.dataset);}catch(e){throw new ApiError((e as Error).message);}};
  if(b.action==='import'||b.action==='save_prompt'){
   if(b.revision!==row.revision)throw new ApiError('Workspace changed in another tab. Reload before saving.',409);
   if(b.action==='import'){try{w.dataset=validateDataset(b.dataset,true);}catch(e){throw new ApiError((e as Error).message);}}
   else{if(typeof b.prompt!=='string'||!b.prompt.trim()||b.prompt.length>16000)throw new ApiError('Prompt must contain 1–16,000 characters.');if(w.versions.length>=100)throw new ApiError('Maximum 100 prompt versions per workspace.');w.versions.push({id:crypto.randomUUID(),name:typeof b.name==='string'?b.name.trim().slice(0,80)||'Candidate':'Candidate',prompt:b.prompt.trim(),createdAt:new Date().toISOString(),source:'User-reviewed prompt'});}
   if(!await store.write(wk,w,row.revision))throw new ApiError('Workspace changed in another tab. Reload before saving.',409);return send({dataset:w.dataset,versions:w.versions,revision:row.revision+1});
  }
  if(b.action==='suggest'){
   let cases=w.dataset;if(b.jobId){const {job}=await getJob(b.jobId);if(!job.baselineOnly||job.status!=='complete')throw new ApiError('Select a completed baseline collection.');cases=job.cases;}else if(b.reportId){const {data}=await getRun(b.reportId);cases=data.report.datasetSnapshot.map(c=>{const pair=data.report.pairs.find(p=>p.id===c.id);return{...c,baseline:pair?.before.response,improved:pair?.after.response};});}
   if(!cases.some(c=>c.split==='train'&&c.baseline?.trim()))throw new ApiError('Collect baseline training responses or select a saved report first.');const p=typeof b.prompt==='string'?b.prompt:w.versions[0].prompt;if(p.length>14500)throw new ApiError('Shorten this prompt before adding a patch.');return send({prompt:refine(p,pairCases(cases))});
  }
  if(b.action==='test_connection'){const key=keyCheck(b.apiKey),result=await groq<GroqModels>(key,'models',undefined,transport);const models=(Array.isArray(result?.data)?result.data:[]).flatMap((model:unknown)=>model&&typeof model==='object'&&'id' in model&&typeof model.id==='string'?[model.id]:[]).sort();if(!models.length)throw new ApiError('No available models were returned.',502);return send({verified:true,models});}
  if(b.action==='delete_run'||b.action==='restore_run'){const r=await getRun(b.id);r.data.trashed=b.action==='delete_run';if(!await store.write(rk(r.data.report.id),r.data,r.row.revision))throw new ApiError('Report changed. Reload and retry.',409);return send({ok:true});}
  if(b.action==='run'){
   validRunDataset();if(b.mode!=='replay'&&b.mode!=='manual')throw new ApiError('Use the resumable live evaluation workflow for AI calls.');const {baselineVersion,improvedVersion}=selectVersions();let cases=w.dataset.map(c=>({...c}));
   if(b.mode==='manual'){if(!b.responses||typeof b.responses!=='object')throw new ApiError('Provide paired responses for every case.');cases=cases.map(c=>{const r=(b.responses as Record<string,{baseline?:unknown;improved?:unknown}>)[c.id];if(!r||typeof r.baseline!=='string'||typeof r.improved!=='string'||!r.baseline.trim()||!r.improved.trim()||r.baseline.length>24000||r.improved.length>24000)throw new ApiError(`Both responses are required for ${c.id}.`);return{...c,baseline:r.baseline,improved:r.improved};});}
   if(cases.some(c=>!c.baseline?.trim()||!c.improved?.trim()))throw new ApiError('Both responses are required for every task. Use manual or live collection.');const report=reportFor(crypto.randomUUID(),typeof b.name==='string'?b.name.trim().slice(0,100)||'Paired evaluation':'Paired evaluation',b.mode,cases,baselineVersion,improvedVersion);await saveReport(report);return send({report},201);
  }
  if(b.action==='start_live'){
   validRunDataset();keyCheck(b.apiKey);const baselineOnly=b.baselineOnly===true;const tasks=baselineOnly?w.dataset.filter(c=>c.split==='train'):w.dataset;if(tasks.length>20)throw new ApiError('Live runs support up to 20 tasks. Split larger datasets.');if(typeof b.model!=='string'||!b.model.trim()||b.model.length>120)throw new ApiError('Enter a Groq chat model ID.');const {baselineVersion,improvedVersion}=selectVersions();if(!baselineOnly&&baselineVersion.prompt===improvedVersion.prompt)throw new ApiError('Save and select different baseline and candidate instructions.');if(typeof b.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(b.requestId))throw new ApiError('A valid request ID is required.');
   const existing=await store.read(jk(b.requestId));if(existing){await index('jobIds',b.requestId);return send({job:existing.value});}
   const job:Job={baselineOnly,id:b.requestId,name:typeof b.name==='string'?b.name.trim().slice(0,100)||'Live evaluation':'Live evaluation',model:b.model.trim(),createdAt:new Date().toISOString(),cases:tasks.map(withoutResponses),baselineVersion,improvedVersion,completed:0,total:tasks.length*(baselineOnly?1:2),status:'paused',lease:0};const created=await store.create(jk(job.id),job);await index('jobIds',job.id);return created?send({job},201):send({job:(await getJob(job.id)).job});
  }
  if(b.action==='step_live'){
   const key=keyCheck(b.apiKey),{row:r,job}=await getJob(b.id);if(job.status==='archived')throw new ApiError('This evaluation was archived. Start a new run.');
   const finish=async(revision:number)=>{
    const report=job.baselineOnly?undefined:reportFor(job.id,job.name,'live',job.cases,job.baselineVersion,job.improvedVersion,job.model);
    if(report)await saveReport(report);
    job.status='complete';
    job.lease=0;
    if(!await store.write(jk(job.id),job,revision))throw new ApiError('Progress changed. Reload before resuming.',409);
    return send({job,report});
   };
   if(job.status==='complete')return send({job,report:job.baselineOnly?undefined:(await getRun(job.id)).data.report});if(job.completed===job.total)return finish(r.revision);if(b.expectedStep!==job.completed)throw new ApiError('Progress changed. Reload or resume the saved evaluation.',409);if(job.lease>Date.now())throw new ApiError('A model call is already in progress. Wait and resume.',409);
   job.lease=Date.now()+45000;if(!await store.write(jk(job.id),job,r.revision))throw new ApiError('Another tab is processing this response.',409);
   try{const c=job.cases[job.baselineOnly?job.completed:Math.floor(job.completed/2)],side=job.baselineOnly||job.completed%2===0?'baseline':'improved';const result=await groq<GroqCompletion>(key,'chat/completions',{model:job.model,messages:[{role:'system',content:side==='baseline'?job.baselineVersion.prompt:job.improvedVersion.prompt},{role:'user',content:c.task}],temperature:0,max_completion_tokens:1200},transport);const choice=result?.choices?.[0],content=choice?.message?.content;if(typeof content!=='string'||!content.trim()||content.length>24000)throw new ApiError('Provider returned an empty or oversized response.',502);if(choice?.finish_reason==='length')throw new ApiError('The model hit the response token limit. Shorten the task and start a new run.',422);c[side]=content;job.completed++;job.lease=0;delete job.error;if(bytes(job)>1500000){delete c[side];job.completed--;throw new ApiError('Evaluation data is too large. Split the dataset.');}if(!await store.write(jk(job.id),job,r.revision+1))throw new ApiError('Progress changed. Reload before resuming.',409);
    return job.completed===job.total?finish(r.revision+2):send({job});
   }catch(e){job.lease=0;job.error=e instanceof ApiError?e.message:'This step could not be completed. Reload before resuming.';await store.write(jk(job.id),job,r.revision+1);throw e;}
  }
  if(b.action==='archive_job'){const {row:r,job}=await getJob(b.id);if(job.lease>Date.now())throw new ApiError('Wait for the current response to finish.');job.status='archived';if(!await store.write(jk(job.id),job,r.revision))throw new ApiError('Evaluation changed. Reload and retry.',409);return send({ok:true});}
  throw new ApiError('Unknown workspace action.');
 }catch(e){return send({error:e instanceof ApiError?e.message:'The request could not be completed. Reload the workspace and retry.'},e instanceof ApiError?e.status:500);}
}
