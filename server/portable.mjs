import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleApi} from './api.ts';
export async function createServer(store){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist/public');
 const server=http.createServer(async(req,res)=>{try{
  const host=req.headers.host??'localhost';const forwarded=req.headers['x-forwarded-proto'];const protocol=process.env.TRUST_PROXY==='1'&&forwarded==='https'?'https':'http';
  const url=new URL(req.url??'/',`${protocol}://${host}`);
  if(url.pathname==='/health'){try{await store.read('health');res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'ok',storage:'connected'}));}catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'unavailable'}));}return;}
  if(url.pathname==='/api/workspace'){
   let bytes=0;const chunks=[];for await(const c of req){bytes+=c.length;if(bytes>2000000){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Request exceeds 2 MB.'}));return;}chunks.push(c);}
   const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(', '):v);
   const r=await handleApi(new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method??'GET')?{body:Buffer.concat(chunks)}:{})}),store);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Method not allowed');return;}
  const decoded=decodeURIComponent(url.pathname);let file=path.resolve(root,'.'+decoded);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(404);res.end('Not found');return;}
  if(decoded==='/'||!path.extname(decoded))file=path.join(root,'index.html');
  try{if(!(await stat(file)).isFile())throw new Error();}catch{res.writeHead(404);res.end('Not found');return;}
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:await readFile(file));
 }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'The request could not be completed.'}));}});
 server.requestTimeout=60000;return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 let store;if(process.env.DATABASE_URL){const{PostgresStore}=await import('./postgres.mjs');store=new PostgresStore(process.env.DATABASE_URL);await store.init();}else{const{SQLiteStore}=await import('./sqlite.mjs');store=new SQLiteStore(process.env.DB_PATH??'./storage/gaplab.sqlite');}
 const app=await createServer(store),port=Number(process.env.PORT??3000);app.listen(port,'0.0.0.0',()=>console.log(`GapLab is listening on port ${port}. No sign-in required.`));
 const shutdown=()=>app.close(async()=>{await store.close();process.exit(0);});process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
